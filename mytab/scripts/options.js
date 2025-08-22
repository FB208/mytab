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
  importBookmarks: document.getElementById('btn-import-bookmarks'), // 导入书签按钮
  bgUrl: document.getElementById('bg-url'),          // 背景图片URL输入框
  bgSave: document.getElementById('btn-bg-save')    // 保存背景按钮
};

// 初始化页面
await init();

// 开发者工具函数 - 在控制台中可以调用
window.clearWebdavPermissions = async function() {
  const url = els.url.value;
  if (!url) {
    console.log('请先输入WebDAV URL');
    return;
  }
  return await removeWebdavPermissions(url);
};

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
  // 只有当用户真正设置了背景图片时才显示，否则显示为空（不显示系统默认URL）
  els.bgUrl.value = (data.backgroundImage && data.backgroundImage.trim()) || '';
  els.bgUrl.placeholder = "请输入背景图片Url（留空则使用默认背景）";

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
    try {
      // 如果设置了WebDAV URL，需要申请相关权限
      const webdavUrl = normalizeUrl(els.url.value);
      if (webdavUrl && webdavUrl.trim()) {
        // 申请访问外部URL的权限
        const hasPermission = await requestWebdavPermissions(webdavUrl);
        if (!hasPermission) {
          toast('需要权限才能保存WebDAV配置');
          return;
        }
      }

      // 构建新的设置对象
      const next = {
        webdav: { 
          url: webdavUrl, 
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
      
    } catch (error) {
      console.error('保存设置失败:', error);
      toast('保存失败: ' + (error.message || error));
    }
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

      const webdavUrl = normalizeUrl(els.url.value);
      if (webdavUrl && webdavUrl.trim()) {
        // 申请访问外部URL的权限
        const hasPermission = await requestWebdavPermissions(webdavUrl);
        if (!hasPermission) {
          toast('需要权限才能保存WebDAV配置');
          return;
        }
      }

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
   * 导入书签按钮点击事件
   * 导入浏览器书签到本插件中
   */
  els.importBookmarks.addEventListener('click', async () => {
    await handleImportBookmarks();
  });

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

/**
 * ===========================================
 * 书签导入功能
 * ===========================================
 */

/**
 * 显示导入选项对话框
 * @returns {Promise<Object|null>} 导入选项或null（用户取消）
 */
async function showImportOptionsDialog() {
  return new Promise((resolve) => {
    // 创建遮罩层
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    // 创建对话框容器
    const modal = document.createElement('div');
    modal.className = 'modal';

    // 创建对话框面板
    const panel = document.createElement('div');
    panel.className = 'panel glass';

    // 创建内容区域
    const inner = document.createElement('div');
    inner.className = 'inner';

    // 标题
    const title = document.createElement('h3');
    title.textContent = '书签导入选项';
    title.style.margin = '0 0 20px 0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--text)';

    // 选项说明
    const description = document.createElement('p');
    description.textContent = '请选择导入模式（建议首次使用选择增强导入）：';
    description.style.margin = '0 0 16px 0';
    description.style.fontSize = '14px';
    description.style.color = 'var(--text-dim)';

    // 增强导入选项
    const enhancedOption = document.createElement('label');
    enhancedOption.className = 'options-inline';
    enhancedOption.style.display = 'block';
    enhancedOption.style.marginBottom = '12px';
    enhancedOption.style.padding = '12px';
    enhancedOption.style.backgroundColor = 'rgba(255,255,255,0.3)';
    enhancedOption.style.borderRadius = '8px';
    enhancedOption.style.border = '1px solid rgba(255,255,255,0.2)';
    enhancedOption.style.cursor = 'pointer';

    const enhancedRadio = document.createElement('input');
    enhancedRadio.type = 'radio';
    enhancedRadio.name = 'importMode';
    enhancedRadio.value = 'enhanced';
    enhancedRadio.checked = true;

    const enhancedLabel = document.createElement('div');
    enhancedLabel.innerHTML = `
      <strong>🚀 增强导入（推荐）</strong><br>
      <small style="color: var(--text-dim);">自动获取网站真实标题和 favicon 图标<br>
      • 支持并发处理，提高导入效率<br>
      • 显示详细进度和统计信息<br>
      • 网络错误时自动使用备选方案<br>
      • 可随时取消，已处理数据会保留</small>
    `;

    enhancedOption.appendChild(enhancedRadio);
    enhancedOption.appendChild(enhancedLabel);

    // 快速导入选项
    const quickOption = document.createElement('label');
    quickOption.className = 'options-inline';
    quickOption.style.display = 'block';
    quickOption.style.marginBottom = '20px';
    quickOption.style.padding = '12px';
    quickOption.style.backgroundColor = 'rgba(255,255,255,0.3)';
    quickOption.style.borderRadius = '8px';
    quickOption.style.border = '1px solid rgba(255,255,255,0.2)';
    quickOption.style.cursor = 'pointer';

    const quickRadio = document.createElement('input');
    quickRadio.type = 'radio';
    quickRadio.name = 'importMode';
    quickRadio.value = 'quick';

    const quickLabel = document.createElement('div');
    quickLabel.innerHTML = `
      <strong>⚡ 快速导入</strong><br>
      <small style="color: var(--text-dim);">仅导入书签基本信息（标题、URL）<br>
      • 速度快，适合大量书签导入<br>
      • 不获取网站标题和图标<br>
      • 适合网络环境不佳时使用</small>
    `;

    quickOption.appendChild(quickRadio);
    quickOption.appendChild(quickLabel);

    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '12px';

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.style.minWidth = '80px';

    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'primary-btn';
    confirmBtn.textContent = '开始导入';
    confirmBtn.style.minWidth = '100px';

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);

    // 组装DOM结构
    inner.appendChild(title);
    inner.appendChild(description);
    inner.appendChild(enhancedOption);
    inner.appendChild(quickOption);
    inner.appendChild(buttonContainer);

    panel.appendChild(inner);
    modal.appendChild(panel);

    // 创建完整的对话框结构
    const dialog = document.createElement('div');
    dialog.appendChild(backdrop);
    dialog.appendChild(modal);

    // 添加到页面
    document.body.appendChild(dialog);
    document.body.style.overflow = 'hidden';

    // 清理函数
    const cleanup = () => {
      document.body.style.overflow = '';
      dialog.remove();
    };

    // 取消按钮事件
    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    // 确认按钮事件
    confirmBtn.addEventListener('click', () => {
      const selectedMode = document.querySelector('input[name="importMode"]:checked')?.value || 'enhanced';
      cleanup();
      resolve({
        enhanced: selectedMode === 'enhanced'
      });
    });

    // 点击遮罩层取消
    backdrop.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
  });
}

/**
 * 显示导入结果对话框
 * @param {Object} stats - 导入统计信息
 * @param {Object} importResult - 导入结果详情
 */
function showImportResultDialog(stats, importResult = null) {
  // 创建遮罩层
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  // 创建对话框容器
  const modal = document.createElement('div');
  modal.className = 'modal';

  // 创建对话框面板
  const panel = document.createElement('div');
  panel.className = 'panel glass';

  // 创建内容区域
  const inner = document.createElement('div');
  inner.className = 'inner';

  // 标题
  const title = document.createElement('h3');
  title.textContent = '书签导入完成';
  title.style.margin = '0 0 20px 0';
  title.style.fontSize = '18px';
  title.style.fontWeight = '600';
  title.style.color = 'var(--text)';

  // 成功图标
  const successIcon = document.createElement('div');
  successIcon.textContent = '✅';
  successIcon.style.fontSize = '48px';
  successIcon.style.textAlign = 'center';
  successIcon.style.marginBottom = '16px';

  // 统计信息容器
  const statsContainer = document.createElement('div');
  statsContainer.style.backgroundColor = 'rgba(255,255,255,0.3)';
  statsContainer.style.borderRadius = '12px';
  statsContainer.style.padding = '16px';
  statsContainer.style.marginBottom = '20px';

  // 基本统计
  const basicStats = document.createElement('div');
  basicStats.style.marginBottom = '12px';
  
  const foldersCount = stats.foldersCount || 0;
  const bookmarksCount = stats.bookmarksCount || 0;
  
  basicStats.innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span>文件夹数量：</span>
      <strong>${foldersCount}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span>书签数量：</span>
      <strong>${bookmarksCount}</strong>
    </div>
  `;

  // 增强统计（如果有）
  const enhancedStats = document.createElement('div');
  if (importResult && importResult.stats) {
    const { successful = 0, failed = 0, processed = 0 } = importResult.stats;
    const enhancedCount = stats.enhancedBookmarksCount || successful;
    
    if (processed > 0) {
      enhancedStats.innerHTML = `
        <hr style="margin: 12px 0; border: none; border-top: 1px solid rgba(255,255,255,0.2);">
        <div style="margin-bottom: 8px; font-weight: 600; color: var(--primary);">增强结果：</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span>成功增强：</span>
          <strong style="color: #10b981;">${successful}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span>增强失败：</span>
          <strong style="color: #ef4444;">${failed}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>增强率：</span>
          <strong>${processed > 0 ? Math.round((successful / processed) * 100) : 0}%</strong>
        </div>
      `;
    }
  }

  statsContainer.appendChild(basicStats);
  statsContainer.appendChild(enhancedStats);

  // 成功消息
  const message = document.createElement('p');
  message.style.textAlign = 'center';
  message.style.fontSize = '14px';
  message.style.color = 'var(--text-dim)';
  message.style.marginBottom = '20px';
  
  let messageText = `✅ 成功导入 ${foldersCount} 个文件夹和 ${bookmarksCount} 个书签`;
  if (stats.enhancedBookmarksCount > 0) {
    messageText += `\n🚀 其中 ${stats.enhancedBookmarksCount} 个书签已成功增强（获取了真实标题和图标）`;
  }
  message.textContent = messageText;

  // 按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'center';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'primary-btn';
  closeBtn.textContent = '关闭';
  closeBtn.style.minWidth = '100px';

  buttonContainer.appendChild(closeBtn);

  // 组装DOM结构
  inner.appendChild(title);
  inner.appendChild(successIcon);
  inner.appendChild(statsContainer);
  inner.appendChild(message);
  inner.appendChild(buttonContainer);

  panel.appendChild(inner);
  modal.appendChild(panel);

  // 创建完整的对话框结构
  const dialog = document.createElement('div');
  dialog.appendChild(backdrop);
  dialog.appendChild(modal);

  // 添加到页面
  document.body.appendChild(dialog);
  document.body.style.overflow = 'hidden';

  // 清理函数
  const cleanup = () => {
    document.body.style.overflow = '';
    dialog.remove();
  };

  // 关闭按钮事件
  closeBtn.addEventListener('click', cleanup);

  // 点击遮罩层关闭
  backdrop.addEventListener('click', cleanup);
}

/**
 * 处理书签导入按钮点击事件
 * 检测当前环境，在插件模式下导入书签，在web模式下显示提示
 */
async function handleImportBookmarks() {
  try {
    // 检测是否为插件模式
    const isExtensionMode = !window.__MYTAB_USE_PROXY__;
    
    console.log('书签导入 - 环境检测:', {
      isExtensionMode,
      hasChrome: !!window.chrome,
      hasBookmarksAPI: !!(window.chrome && window.chrome.bookmarks),
      hasPermissionsAPI: !!(window.chrome && window.chrome.permissions)
    });
    
    if (!isExtensionMode) {
      // Web模式下不支持书签导入
      alert('书签导入功能仅在 Chrome 扩展模式下可用。\n\n如需使用此功能，请：\n1. 安装 MyTab Chrome 扩展\n2. 在扩展中打开设置页面\n3. 使用导入功能');
      return;
    }

    // 检查Chrome扩展环境
    if (!window.chrome) {
      toast('✗ Chrome 扩展环境不可用，请确保在扩展中使用此功能', 3000);
      return;
    }

    // 检查书签API是否可用
    if (!chrome.bookmarks) {
      toast('✗ 书签 API 不可用，请重新加载扩展或检查权限设置', 3000);
      console.error('书签API不可用，请检查manifest.json中的权限配置');
      return;
    }

    // 显示导入选项对话框
    const importOptions = await showImportOptionsDialog();
    if (!importOptions) {
      // 用户取消了导入
      return;
    }

    // 显示加载状态
    els.importBookmarks.disabled = true;
    const oldText = els.importBookmarks.textContent;
    els.importBookmarks.textContent = '导入中...';
    
    toast('正在读取书签数据...');

    // 读取浏览器书签
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // 使用选择的导入模式转换书签数据
    const importedData = await convertBookmarksToMyTab(bookmarkTree, importOptions);
    
    if (importedData.folders.length === 0) {
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = oldText;
      
      toast('没有找到可导入的书签，请检查浏览器是否有书签数据', 3000);
      return;
    }

    // 执行导入
    console.log('开始执行书签导入...');
    try {
      await performBookmarkImport(importedData);
      console.log('书签导入完成');
      
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = oldText;
      
      // 显示导入结果
      showImportResultDialog(importedData.stats, importedData.importResult);
      
    } catch (importError) {
      console.error('执行导入时出错:', importError);
      
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = oldText;
      
      // 显示错误提示
      const errorMsg = importError.message || importError;
      toast('✗ 导入过程中发生错误: ' + errorMsg + '\n请检查网络连接或稍后重试', 4000);
    }
    
  } catch (error) {
    console.error('书签导入失败:', error);
    
    // 恢复按钮状态
    els.importBookmarks.disabled = false;
    els.importBookmarks.textContent = '导入浏览器书签';
    
    // 显示错误提示
    const errorMsg = error.message || error;
    toast('✗ 书签导入失败: ' + errorMsg + '\n请检查扩展权限和网络连接', 4000);
  }
}

/**
 * 清除WebDAV权限（开发测试用）
 * @param {string} url - WebDAV服务器URL
 * @returns {Promise<boolean>} 是否成功清除
 */
async function removeWebdavPermissions(url) {
  try {
    if (!window.chrome || !chrome.permissions) {
      console.warn('Chrome权限API不可用');
      return false;
    }

    // 解析URL获取域名
    let hostname;
    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
    } catch (e) {
      console.error('无效的URL:', url);
      return false;
    }

    // 构建权限对象
    const permissions = {
      origins: [`*://${hostname}/*`]
    };

    // 移除权限
    const removed = await chrome.permissions.remove(permissions);
    
    if (removed) {
      console.log('WebDAV权限已清除:', hostname);
      toast('✓ 权限已清除，可以重新测试');
    } else {
      console.log('权限清除失败或权限不存在:', hostname);
      toast('权限清除失败或权限不存在');
    }
    
    return removed;
  } catch (error) {
    console.error('清除权限失败:', error);
    toast('清除权限失败: ' + error.message);
    return false;
  }
}

/**
 * 请求WebDAV相关权限
 * @param {string} url - WebDAV服务器URL
 * @returns {Promise<boolean>} 是否获得权限
 */
async function requestWebdavPermissions(url) {
  try {
    // 检测是否为插件模式
    const isExtensionMode = !window.__MYTAB_USE_PROXY__;
    
    if (!isExtensionMode) {
      // Web模式下不需要权限申请
      return true;
    }

    // 检查Chrome扩展环境
    if (!window.chrome || !chrome.permissions) {
      console.warn('Chrome权限API不可用');
      return true; // 在非扩展环境下允许继续
    }

    // 解析URL获取域名
    let hostname;
    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
    } catch (e) {
      console.error('无效的URL:', url);
      return false;
    }

    // 构建权限请求
    const permissions = {
      origins: [`*://${hostname}/*`]
    };

    // 检查是否已有权限
    const hasPermission = await chrome.permissions.contains(permissions);
    
    if (hasPermission) {
      return true;
    }
    
    // 直接申请权限，不使用前置确认对话框
    // 这样可以确保权限申请在用户手势上下文中进行
    console.log('申请WebDAV权限:', hostname);
    
    let granted;
    try {
      // 添加短暂延迟，确保用户操作完成
      await new Promise(resolve => setTimeout(resolve, 100));
      granted = await chrome.permissions.request(permissions);
    } catch (requestError) {
      console.error('权限申请异常:', requestError);
      // 如果权限申请抛出异常，可能是因为用户手势上下文丢失
      alert(
        `权限申请失败\n\n` +
        `无法申请访问 ${hostname} 的权限。\n\n` +
        `可能的原因：\n` +
        `• 浏览器阻止了权限申请\n` +
        `• 权限申请超时\n\n` +
        `解决方法：\n` +
        `• 请重新点击保存按钮\n` +
        `• 检查浏览器是否阻止了弹窗\n` +
        `• 在扩展管理页面手动添加网站权限`
      );
      return false;
    }
    
    if (granted) {
      console.log('WebDAV权限申请成功:', hostname);
      toast('✓ 权限申请成功，可以正常使用WebDAV功能');
    } else {
      console.log('WebDAV权限申请被拒绝:', hostname);
      // 提供更详细的失败说明
      alert(
        `权限申请被拒绝\n\n` +
        `您拒绝了访问 ${hostname} 的权限申请。\n\n` +
        `如需使用WebDAV功能，请：\n` +
        `• 重新点击保存按钮并在弹窗中选择"允许"\n` +
        `• 或在扩展管理页面手动添加网站权限\n\n` +
        `权限用途：\n` +
        `• 测试服务器连接状态\n` +
        `• 上传和下载备份数据`
      );
    }
    
    return granted;
  } catch (error) {
    console.error('WebDAV权限请求失败:', error);
    alert(
      `权限申请出现异常\n\n` +
      `错误信息：${error.message || error}\n\n` +
      `请尝试：\n` +
      `• 重新加载扩展\n` +
      `• 重启浏览器\n` +
      `• 检查扩展是否正常安装`
    );
    return false;
  }
}



/**
 * 将Chrome书签数据转换为MyTab格式（增强版）
 * 使用 EnhancedBookmarkImporter 自动获取网站标题和图标
 * @param {Array} bookmarkTree - Chrome书签树
 * @param {Object} options - 导入选项
 * @param {boolean} options.enhanced - 是否启用增强功能
 * @returns {Promise<Object>} 转换后的数据
 */
async function convertBookmarksToMyTab(bookmarkTree, options = { enhanced: true }) {
  const { generateId } = await import('./storage.js');
  const { EnhancedBookmarkImporter } = await import('./enhanced-bookmark-importer.js');
  const { ProgressDialog } = await import('./progress-dialog.js');
  
  const result = {
    folders: [],
    stats: {
      foldersCount: 0,
      bookmarksCount: 0,
      enhancedBookmarksCount: 0
    },
    importResult: null
  };

  // 创建进度对话框（仅在增强模式下显示）
  const progressDialog = options.enhanced ? new ProgressDialog() : null;
  let importer = null;

  try {
    // 从根节点开始转换，通常是 bookmarkTree[0]
    if (!bookmarkTree || bookmarkTree.length === 0) {
      return result;
    }

    const rootNode = bookmarkTree[0];
    console.log('读取到的根书签节点:', rootNode);
    
    if (!rootNode.children) {
      return result;
    }

    // 第一步：构建文件夹结构（不包含书签内容）
    const foldersToImport = [];
    const allBookmarks = []; // 收集所有书签用于批量增强
    
    // 处理每一个顶级文件夹
    for (const child of rootNode.children) {
      console.log('顶级文件夹/节点:', child.title, child);
      
      // 如果是系统文件夹（书签栏或其他书签）
      if (isSystemBookmarkFolder(child)) {
        // 创建一个新文件夹，使用系统文件夹名称
        const systemFolder = {
          id: generateId('f'),
          name: child.title,
          icon: '📁',
          type: 'folder',
          parentId: null,
          bookmarks: [],
          children: []
        };
        
        // 递归处理该系统文件夹下的所有内容
        const { bookmarks: folderBookmarks, subFolders } = await processBookmarkFolder(child, systemFolder.id, generateId);
        
        // 收集书签用于批量增强
        console.log(`系统文件夹 ${child.title} 收集到 ${folderBookmarks.length} 个书签`);
        folderBookmarks.forEach(bookmark => {
          console.log(`  - ${bookmark.title} (${bookmark.url}) -> 文件夹 ${bookmark.parentFolderId}`);
        });
        allBookmarks.push(...folderBookmarks);
        
        // 添加子文件夹
        systemFolder.children = subFolders;
        
        // 只有当有内容时才添加该文件夹
        if (folderBookmarks.length > 0 || subFolders.length > 0) {
          result.stats.foldersCount++;
          foldersToImport.push(systemFolder);
          
          // 暂时将书签引用存储，稍后会被增强后的书签替换
          systemFolder._bookmarkRefs = folderBookmarks;
        }
      } else {
        // 非系统文件夹，直接处理
        const { bookmarks: folderBookmarks, folder: convertedFolder } = await processBookmarkNode(child, null, generateId);
        
        if (convertedFolder) {
          console.log(`非系统文件夹 ${convertedFolder.name} 收集到 ${folderBookmarks.length} 个书签`);
          folderBookmarks.forEach(bookmark => {
            console.log(`  - ${bookmark.title} (${bookmark.url}) -> 文件夹 ${bookmark.parentFolderId}`);
          });
          allBookmarks.push(...folderBookmarks);
          foldersToImport.push(convertedFolder);
          convertedFolder._bookmarkRefs = folderBookmarks;
        }
      }
    }

    // 更新基础统计
    result.stats.bookmarksCount = allBookmarks.length;
    result.folders = foldersToImport;

    // 如果没有书签，直接返回
    if (allBookmarks.length === 0) {
      return result;
    }

    // 第二步：根据选项决定是否使用增强功能
    if (options.enhanced) {
      // 增强模式：使用 EnhancedBookmarkImporter 批量增强书签
      console.log(`开始增强 ${allBookmarks.length} 个书签...`);
      
      // 显示进度对话框
      progressDialog.show(allBookmarks.length, () => {
        if (importer) {
          importer.cancel();
        }
      });

      // 创建增强导入器
      importer = new EnhancedBookmarkImporter({
        concurrency: 6,
        timeout: 5000,
        onProgress: (progress) => {
          // 更新进度对话框，包含时间估算
          progressDialog.updateProgress(
            progress.processed || 0,
            progress.total || allBookmarks.length,
            progress.currentUrl || '',
            progress.timing
          );
          
          progressDialog.updateStats({
            successful: progress.successful || 0,
            failed: progress.failed || 0,
            processed: progress.processed || 0,
            cached: progress.cached || 0,
            errorsByType: progress.errorsByType,
            concurrencyAdjustments: progress.concurrencyAdjustments
          }, progress.timing);
        },
        onError: (error) => {
          console.warn('书签增强过程中出现错误:', error);
        }
      });

      // 执行批量增强，传入我们已经处理好的书签数据而不是原始的书签树
      const enhancementResult = await importer.importBookmarksFromList(allBookmarks);
      result.importResult = enhancementResult;
      
      if (enhancementResult.success) {
        // 增强成功，更新统计信息
        result.stats.enhancedBookmarksCount = enhancementResult.stats.successful || 0;
        
        // 创建增强书签的映射表（URL -> 增强书签）
        const enhancedBookmarkMap = new Map();
        console.log(`创建增强书签映射表，共 ${enhancementResult.bookmarks.length} 个增强书签`);
        for (const enhancedBookmark of enhancementResult.bookmarks) {
          if (enhancedBookmark.url) {
            enhancedBookmarkMap.set(enhancedBookmark.url, enhancedBookmark);
            console.log(`映射: ${enhancedBookmark.url} -> ${enhancedBookmark.title} (增强=${enhancedBookmark.enhanced})`);
          }
        }
        console.log(`增强书签映射表创建完成，共 ${enhancedBookmarkMap.size} 个条目`);
        
        // 第三步：将增强后的书签数据应用到文件夹结构中
        for (const folder of result.folders) {
          await applyEnhancedBookmarksToFolder(folder, enhancedBookmarkMap);
        }
        
        // 显示完成状态
        progressDialog.setCompleted({
          successful: enhancementResult.stats.successful || 0,
          failed: enhancementResult.stats.failed || 0,
          processed: enhancementResult.stats.processed || 0
        });
        
        console.log('书签增强完成:', enhancementResult.stats);
      } else {
        // 增强失败，使用原始书签数据
        console.warn('书签增强失败，使用原始数据:', enhancementResult.error);
        
        // 将原始书签应用到文件夹结构
        for (const folder of result.folders) {
          await applyOriginalBookmarksToFolder(folder);
        }
        
        progressDialog.setError(enhancementResult.error || '增强过程失败');
      }

      // 延迟关闭进度对话框，让用户看到结果
      setTimeout(() => {
        progressDialog.hide();
      }, 2000);
    } else {
      // 快速模式：直接使用原始书签数据
      console.log(`快速导入 ${allBookmarks.length} 个书签...`);
      
      // 将原始书签应用到文件夹结构
      for (const folder of result.folders) {
        await applyOriginalBookmarksToFolder(folder);
      }
      
      console.log('快速导入完成');
    }

  } catch (error) {
    console.error('书签转换过程中出现错误:', error);
    
    // 显示详细的错误状态（仅在增强模式下）
    if (progressDialog && progressDialog.visible) {
      let errorMessage = error.message || String(error);
      
      // 根据错误类型提供更友好的错误信息
      if (errorMessage.includes('网络错误') || errorMessage.includes('Failed to fetch')) {
        errorMessage = '网络连接失败，请检查网络连接后重试';
      } else if (errorMessage.includes('超时')) {
        errorMessage = '请求超时，可能是网络较慢或目标网站响应缓慢';
      } else if (errorMessage.includes('权限')) {
        errorMessage = '权限不足，请确保已授予必要的浏览器权限';
      }
      
      progressDialog.setError(errorMessage);
      
      // 延长错误显示时间，让用户有足够时间阅读
      setTimeout(() => {
        progressDialog.hide();
      }, 5000);
    }
    
    throw error;
  } finally {
    // 清理资源
    if (importer) {
      importer.destroy();
    }
  }

  return result;
}

/**
 * 检查是否为系统书签文件夹
 * @param {Object} node - 书签节点
 * @returns {boolean} 是否为系统文件夹
 */
function isSystemBookmarkFolder(node) {
  // Chrome系统文件夹的特殊标识
  const systemFolderIds = ['1', '2']; // 1=书签栏, 2=其他书签
  const systemFolderTitles = [
    'Bookmarks bar', '书签栏', '书签列',
    'Other bookmarks', '其他书签', '其他書籤',
    'Mobile bookmarks', '手机书签', '移动设备书签'
  ];
  
  return systemFolderIds.includes(node.id) || 
         systemFolderTitles.includes(node.title);
}

/**
 * 递归处理书签文件夹，提取所有书签和子文件夹
 * @param {Object} folderNode - Chrome书签文件夹节点
 * @param {string} parentId - 父文件夹ID
 * @param {Function} generateId - ID生成函数
 * @returns {Promise<Object>} 包含书签数组和子文件夹数组的对象
 */
async function processBookmarkFolder(folderNode, parentId, generateId) {
  const bookmarks = [];
  const subFolders = [];
  
  if (!folderNode.children) {
    return { bookmarks, subFolders };
  }
  
  for (const child of folderNode.children) {
    if (child.url) {
      // 是书签
      bookmarks.push({
        id: generateId('b'),
        title: child.title || '无标题书签',
        url: child.url,
        dateAdded: child.dateAdded || Date.now(),
        parentFolderId: parentId
      });
    } else if (child.children) {
      // 是子文件夹
      const subFolder = {
        id: generateId('f'),
        name: child.title || '无名文件夹',
        icon: '📁',
        type: 'folder',
        parentId: parentId,
        bookmarks: [],
        children: []
      };
      
      // 递归处理子文件夹
      const { bookmarks: subBookmarks, subFolders: subSubFolders } = await processBookmarkFolder(child, subFolder.id, generateId);
      
      // 收集所有书签（包括子文件夹中的）
      bookmarks.push(...subBookmarks);
      
      // 设置子文件夹的子文件夹
      subFolder.children = subSubFolders;
      subFolder._bookmarkRefs = subBookmarks.filter(b => b.parentFolderId === subFolder.id);
      
      // 只有包含内容的文件夹才被保留
      if (subBookmarks.length > 0 || subSubFolders.length > 0) {
        subFolders.push(subFolder);
      }
    }
  }
  
  return { bookmarks, subFolders };
}

/**
 * 处理单个书签节点（可能是文件夹或书签）
 * @param {Object} node - Chrome书签节点
 * @param {string|null} parentId - 父文件夹ID
 * @param {Function} generateId - ID生成函数
 * @returns {Promise<Object>} 包含书签数组和文件夹对象的结果
 */
async function processBookmarkNode(node, parentId, generateId) {
  if (node.url) {
    // 是书签
    const bookmark = {
      id: generateId('b'),
      title: node.title || '无标题书签',
      url: node.url,
      dateAdded: node.dateAdded || Date.now(),
      parentFolderId: parentId
    };
    return { bookmarks: [bookmark], folder: null };
  } else if (node.children) {
    // 是文件夹
    const folder = {
      id: generateId('f'),
      name: node.title || '无名文件夹',
      icon: '📁',
      type: 'folder',
      parentId: parentId,
      bookmarks: [],
      children: []
    };
    
    // 递归处理文件夹内容
    const { bookmarks, subFolders } = await processBookmarkFolder(node, folder.id, generateId);
    
    folder.children = subFolders;
    
    // 只有包含内容的文件夹才被保留
    if (bookmarks.length > 0 || subFolders.length > 0) {
      return { bookmarks, folder };
    }
  }
  
  return { bookmarks: [], folder: null };
}

/**
 * 将增强后的书签数据应用到文件夹结构中
 * @param {Object} folder - 文件夹对象
 * @param {Map} enhancedBookmarkMap - 增强书签映射表（URL -> 增强书签）
 */
async function applyEnhancedBookmarksToFolder(folder, enhancedBookmarkMap) {
  console.log(`处理文件夹: ${folder.name} (ID: ${folder.id})`);
  
  // 处理当前文件夹的书签
  if (folder._bookmarkRefs) {
    console.log(`文件夹 ${folder.name} 有 ${folder._bookmarkRefs.length} 个书签引用`);
    
    const filteredBookmarks = folder._bookmarkRefs.filter(bookmark => {
      const matches = bookmark.parentFolderId === folder.id;
      console.log(`书签 ${bookmark.title} (${bookmark.url}) parentFolderId=${bookmark.parentFolderId}, folder.id=${folder.id}, 匹配=${matches}`);
      return matches;
    });
    
    console.log(`过滤后有 ${filteredBookmarks.length} 个匹配的书签`);
    
    folder.bookmarks = filteredBookmarks.map(originalBookmark => {
      const enhanced = enhancedBookmarkMap.get(originalBookmark.url);
      if (enhanced) {
        console.log(`找到增强数据: ${originalBookmark.url} -> ${enhanced.title}`);
        // 使用增强后的数据，但保留原始的ID和文件夹关联
        const finalTitle = enhanced.title || enhanced.originalTitle || originalBookmark.title || '无标题书签';
        return {
          ...enhanced,
          id: originalBookmark.id,
          parentFolderId: originalBookmark.parentFolderId,
          dateAdded: originalBookmark.dateAdded,
          // 确保标题不为空，如果增强后的标题为空，使用原始标题
          title: finalTitle
        };
      } else {
        console.log(`未找到增强数据，使用原始书签: ${originalBookmark.url}`);
        // 如果没有增强数据，使用原始书签
        return originalBookmark;
      }
    });
    
    console.log(`文件夹 ${folder.name} 最终有 ${folder.bookmarks.length} 个书签`);
    
    // 清理临时引用
    delete folder._bookmarkRefs;
  }
  
  // 递归处理子文件夹
  if (folder.children) {
    for (const subFolder of folder.children) {
      await applyEnhancedBookmarksToFolder(subFolder, enhancedBookmarkMap);
    }
  }
}

/**
 * 将原始书签数据应用到文件夹结构中（增强失败时的备选方案）
 * @param {Object} folder - 文件夹对象
 */
async function applyOriginalBookmarksToFolder(folder) {
  console.log(`[快速模式] 处理文件夹: ${folder.name} (ID: ${folder.id})`);
  
  // 处理当前文件夹的书签
  if (folder._bookmarkRefs) {
    console.log(`[快速模式] 文件夹 ${folder.name} 有 ${folder._bookmarkRefs.length} 个书签引用`);
    
    const filteredBookmarks = folder._bookmarkRefs.filter(bookmark => {
      const matches = bookmark.parentFolderId === folder.id;
      console.log(`[快速模式] 书签 ${bookmark.title} (${bookmark.url}) parentFolderId=${bookmark.parentFolderId}, folder.id=${folder.id}, 匹配=${matches}`);
      return matches;
    });
    
    folder.bookmarks = filteredBookmarks;
    console.log(`[快速模式] 文件夹 ${folder.name} 最终有 ${folder.bookmarks.length} 个书签`);
    
    delete folder._bookmarkRefs;
  }
  
  // 递归处理子文件夹
  if (folder.children) {
    for (const subFolder of folder.children) {
      await applyOriginalBookmarksToFolder(subFolder);
    }
  }
}

/**
 * 执行书签导入
 * @param {Object} importedData - 要导入的数据
 */
async function performBookmarkImport(importedData) {
  console.log('开始读取现有数据...');
  // 读取现有数据
  const { data } = await readAll();
  console.log('现有数据:', { foldersCount: data.folders?.length || 0 });
  
  // 确保 folders 是数组
  if (!Array.isArray(data.folders)) {
    console.warn('data.folders 不是数组，初始化为空数组');
    data.folders = [];
  }
  
  console.log('将要导入的数据:', { foldersCount: importedData.folders?.length || 0 });
  
  // 将导入的文件夹添加到现有数据中
  data.folders = data.folders.concat(importedData.folders);
  console.log('合并后的数据:', { foldersCount: data.folders.length });
  
  // 更新修改时间
  data.lastModified = Date.now();
  
  // 保存数据
  console.log('开始保存数据...');
  await writeData(data);
  console.log('数据保存完成');
  
  // 通知数据变更（如果在插件模式下）
  try {
    console.log('发送数据变更通知...');
    // 设置超时，避免无限等待
    const sendMessageWithTimeout = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve({ timeout: true });
      }, 1000); // 1秒超时
      
      chrome.runtime.sendMessage({ type: 'data:changed' })
        .then(response => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
    
    const response = await sendMessageWithTimeout;
    if (response?.timeout) {
      console.log('数据变更通知已发送（未等待响应）');
    } else {
      console.log('数据变更通知发送成功', response);
    }
  } catch (error) {
    // 在web模式下可能会失败，忽略错误
    console.log('数据变更通知失败（正常）:', error);
  }
}
