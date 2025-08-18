/**
 * MyTab 扩展选项页面脚本
 * 负责管理扩展的设置配置，包括：
 * - WebDAV 服务器配置
 * - 自动备份设置
 * - 背景图片设置
 * - 备份历史管理
 * - 数据恢复功能
 */

// 导入存储管理模块
import { readAll, writeSettings, writeData } from './storage.js';

/**
 * DOM元素引用映射
 * 集中管理页面中所有需要交互的DOM元素
 */
const els = {
  url: document.getElementById('dav-url'),           // WebDAV服务器URL输入框
  username: document.getElementById('dav-username'), // WebDAV用户名输入框
  password: document.getElementById('dav-password'), // WebDAV密码输入框
  backHome: document.getElementById('btn-back-home'), // 返回主页按钮
  enabled: document.getElementById('backup-enabled'),  // 自动备份开关复选框
  hours: document.getElementById('backup-hours'),    // 备份频率输入框（小时）
  max: document.getElementById('backup-max'),        // 最大快照数输入框
  test: document.getElementById('btn-test'),         // 测试连接按钮
  save: document.getElementById('btn-save'),       // 保存设置按钮
  backupNow: document.getElementById('btn-backup-now'), // 立即备份按钮
  checkCloud: document.getElementById('btn-check-cloud'), // 检查云端更新按钮
  refresh: document.getElementById('btn-refresh-list'), // 刷新备份列表按钮
  list: document.getElementById('backup-list'),     // 备份历史列表容器
  bgUrl: document.getElementById('bg-url'),          // 背景图片URL输入框
  bgSave: document.getElementById('btn-bg-save')    // 保存背景按钮
};

// 初始化页面
await init();

/**
 * 页面初始化函数
 * 1. 从存储中读取当前配置并填充表单
 * 2. 绑定所有交互事件
 * 3. 加载备份历史列表
 */
async function init() {
  // 读取当前存储的设置和数据
  const { settings, data } = await readAll();
  
  // 填充WebDAV配置
  els.url.value = settings.webdav?.url || '';
  els.username.value = settings.webdav?.username || '';
  els.password.value = settings.webdav?.password || '';
  
  // 填充自动备份配置
  els.enabled.checked = !!settings.backup?.enabled;
  els.hours.value = settings.backup?.frequencyHours ?? 4;
  els.max.value = settings.backup?.maxSnapshots ?? 100;
  
  // 填充背景图片配置
  els.bgUrl.value = data.backgroundImage || '';
  els.bgUrl.placeholder = "请输入背景图片Url";

  // 绑定事件监听器
  bind();
  
  // 加载备份历史列表
  await refreshList();
}

/**
 * 绑定所有交互事件
 * 为页面中的所有按钮和输入框添加事件监听
 */
function bind() {
  // 返回主页按钮
  els.backHome?.addEventListener('click', () => {
    // 打开扩展的新标签页（index.html）
    window.open('index.html', '_self');
  });

  /**
   * 保存设置按钮点击事件
   * 收集表单数据并保存到存储中
   */
  els.save.addEventListener('click', async () => {
    // 构建新的设置对象
    const next = {
      webdav: { 
        url: normalizeUrl(els.url.value), 
        username: els.username.value, 
        password: els.password.value 
      },
      backup: { 
        enabled: els.enabled.checked, 
        frequencyHours: Number(els.hours.value) || 4, 
        maxSnapshots: Math.max(1, Number(els.max.value) || 100) 
      }
    };
    
    // 保存到存储
    await writeSettings(next);
    toast('已保存');
    
  });

  /**
   * 测试连接按钮点击事件
   * 测试WebDAV服务器连接是否可用
   */
  els.test.addEventListener('click', async () => {
    const config = { 
      url: normalizeUrl(els.url.value), 
      username: els.username.value, 
      password: els.password.value 
    };
    
    try {
      toast('连接测试中...');
      const res = await chrome.runtime.sendMessage({ type: 'webdav:test', config });
      
      if (res?.ok) {
        if (res.canWrite) {
          toast('✅ 连接成功，可读写');
        } else {
          toast('✅ 连接成功，只读权限');
        }
      } else {
        toast('❌ ' + (res?.error || '连接失败'));
      }
    } catch (e) {
      toast('❌ 测试异常：' + e.message);
    }
  });

  /**
   * 立即备份按钮点击事件
   * 手动触发数据备份到WebDAV服务器
   */
  els.backupNow.addEventListener('click', async () => {
    try {
      // 显示加载状态
      els.backupNow.disabled = true;
      const oldText = els.backupNow.textContent;
      els.backupNow.textContent = '备份中…';
      
      toast('开始备份');
      const res = await chrome.runtime.sendMessage({ type: 'backup:manual' });
      
      if (res?.ok) {
        toast('备份完成');
        await refreshList(); // 刷新备份列表
      } else {
        toast('失败: ' + (res?.error || ''));
      }
      
      // 恢复按钮状态
      els.backupNow.textContent = oldText;
      els.backupNow.disabled = false;
    } catch (e) {
      els.backupNow.disabled = false;
      els.backupNow.textContent = '立即备份';
      toast('失败: ' + String(e?.message || e));
    }
  });

  /**
   * 检查云端更新按钮点击事件
   * 检查WebDAV服务器上是否有更新的备份数据
   */
  els.checkCloud.addEventListener('click', async () => {
    try {
      // 显示加载状态
      els.checkCloud.disabled = true;
      const oldText = els.checkCloud.textContent;
      els.checkCloud.textContent = '检查中…';
      
      // 请求后台检查云端数据
      const res = await chrome.runtime.sendMessage({ type: 'cloud:manual-check' });
      if (!res?.ok) {
        throw new Error(res?.error || '检查失败');
      }
      
      if (!res.result) {
        toast('未配置WebDAV或备份未启用');
        return;
      }
      
      if (!res.result.hasNewerData) {
        toast('云端没有更新的数据');
        return;
      }
      
      // 发现更新数据，询问用户是否同步
      const { cloudFile, cloudTime, localTime } = res.result;
      const shouldSync = confirm(
        `发现云端更新数据：\n\n` +
        `云端文件：${cloudFile.name}\n` +
        `云端时间：${cloudTime}\n` +
        `本地时间：${localTime}\n\n` +
        `是否立即同步？（同步前会自动备份当前本地数据）`
      );
      
      if (shouldSync) {
        // 执行同步
        const syncRes = await chrome.runtime.sendMessage({ 
          type: 'cloud:sync', 
          fileName: cloudFile.name 
        });
        
        if (syncRes?.ok) {
          toast('同步成功！');
          await refreshList(); // 刷新备份列表
        } else {
          throw new Error(syncRes?.error || '同步失败');
        }
      }
    } catch (e) {
      toast('操作失败: ' + String(e?.message || e));
    } finally {
      els.checkCloud.disabled = false;
      els.checkCloud.textContent = '检查云端更新';
    }
  });

  // 刷新备份列表按钮
  els.refresh.addEventListener('click', refreshList);

  /**
   * 保存背景图片按钮点击事件
   * 保存用户设置的背景图片URL
   */
  els.bgSave.addEventListener('click', async () => {
    const { data } = await readAll();
    data.backgroundImage = els.bgUrl.value.trim();
    await writeData(data);
    toast('背景地址已保存');
  });
}

/**
 * 刷新备份历史列表
 * 从WebDAV服务器获取备份文件列表并显示
 */
async function refreshList() {
  try {
    // 显示加载状态
    els.list.innerHTML = '加载中...';
    
    // 请求后台获取备份列表
    const res = await chrome.runtime.sendMessage({ type: 'backup:list' });
    if (!res?.ok) throw new Error(res?.error || '');
    
    const items = res.list || [];
    els.list.innerHTML = '';
    
    // 处理空列表情况
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = '暂无备份';
      empty.style.opacity = '.65';
      els.list.appendChild(empty);
      return;
    }
    
    // 渲染备份列表
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'glass';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.name;

      const footerDiv = document.createElement('div');
      footerDiv.className = 'backup-item-footer';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'backup-date';
      dateSpan.textContent = new Date(item.lastmod).toLocaleString();

      const btn = document.createElement('button');
      btn.className = 'mini-btn restore-btn';
      btn.textContent = '恢复';
      
      /**
       * 恢复按钮点击事件
       * 从指定备份文件恢复数据
       */
      btn.addEventListener('click', async () => {
        if (!confirm('确认从该快照恢复？')) return;
        const r = await chrome.runtime.sendMessage({ 
          type: 'backup:restore', 
          name: item.name 
        });
        if (r?.ok) {
          alert('已恢复');
        } else {
          alert('恢复失败: ' + (r?.error || ''));
        }
      });

      footerDiv.appendChild(dateSpan);
      footerDiv.appendChild(btn);
      
      li.appendChild(nameSpan);
      li.appendChild(footerDiv);

      els.list.appendChild(li);
    });
  } catch (e) {
    els.list.innerHTML = '加载失败: ' + String(e?.message || e);
  }
}

/**
 * URL规范化函数
 * 确保WebDAV URL以斜杠结尾
 * @param {string} u - 原始URL
 * @returns {string} - 规范化后的URL
 */
function normalizeUrl(u) {
  if (!u) return '';
  if (!/\/ $/.test(u)) return u + '/';
  return u;
}

/**
 * 轻量级提示函数
 * 显示一个自动消失的提示消息
 * @param {string} text - 提示文本
 * @param {number} duration - 显示时长（毫秒）
 */
function toast(text, duration = 1800) {
  const t = document.createElement('div');
  t.textContent = text;
  t.style.position = 'fixed';
  t.style.right = '20px';
  t.style.bottom = '20px';
  t.style.background = 'rgba(17,24,39,0.9)';
  t.style.color = '#fff';
  t.style.padding = '10px 14px';
  t.style.borderRadius = '10px';
  t.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
  t.style.zIndex = '9999';
  t.style.fontSize = '13px';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, duration - 300);
  setTimeout(() => t.remove(), duration);
}
