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
      alert('该功能仅插件模式支持，在网页版本中无法使用。');
      return;
    }

    // 检查Chrome扩展环境
    if (!window.chrome) {
      toast('✗ Chrome扩展环境不可用');
      return;
    }

    // 检查书签API是否可用
    if (!chrome.bookmarks) {
      toast('✗ 书签API不可用，请重新加载扩展');
      console.error('书签API不可用，请检查manifest.json中的权限配置');
      return;
    }

    // 显示加载状态
    els.importBookmarks.disabled = true;
    const oldText = els.importBookmarks.textContent;
    els.importBookmarks.textContent = '导入中...';
    
    toast('正在读取书签数据...');

    // 读取浏览器书签
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // 转换书签数据
    const importedData = await convertBookmarksToMyTab(bookmarkTree);
    
    if (importedData.folders.length === 0) {
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = '导入浏览器书签';
      
      toast('没有找到可导入的书签');
      return;
    }

    // 显示导入确认对话框
    const shouldImport = await showImportConfirmDialog(importedData);
    if (!shouldImport) {
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = '导入浏览器书签';
      
      toast('已取消导入');
      return;
    }

    // 执行导入
    console.log('开始执行书签导入...');
    try {
      await performBookmarkImport(importedData);
      console.log('书签导入完成');
      
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = '导入浏览器书签';
      
      // 显示成功提示
      toast('✓ 书签导入成功！共导入 ' + importedData.stats.foldersCount + ' 个文件夹，' + importedData.stats.bookmarksCount + ' 个书签', 3000);
    } catch (importError) {
      console.error('执行导入时出错:', importError);
      
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = '导入浏览器书签';
      
      // 显示错误提示
      toast('✗ 导入失败: ' + (importError.message || importError), 3000);
    }
    
  } catch (error) {
    console.error('书签导入失败:', error);
    
    // 恢复按钮状态
    els.importBookmarks.disabled = false;
    els.importBookmarks.textContent = '导入浏览器书签';
    
    // 显示错误提示
    toast('✗ 导入失败: ' + (error.message || error), 3000);
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
    
    // 显示前置提示，解释为什么需要权限
    const shouldProceed = confirm(
      `为了连接到您的WebDAV服务器，MyTab需要访问您如下域名的权限：\n\n` +
      `${hostname}\n\n` +
      `这个权限用于：\n` +
      `• 测试服务器连接状态\n` +
      `• 上传和下载备份数据\n\n` +
      `点击"确定"将打开权限申请对话框，请在浏览器弹窗中选择"允许"。\n\n`
    );
    
    if (!shouldProceed) {
      return false;
    }
    
    // 请求权限
    const granted = await chrome.permissions.request(permissions);
    
    if (granted) {
      console.log('WebDAV权限申请成功:', hostname);
      toast('✓ 权限申请成功，可以正常使用WebDAV功能');
    } else {
      console.log('WebDAV权限申请被拒绝:', hostname);
      // 提供更详细的失败说明
      alert(
        `权限申请失败\n\n` +
        `无法获取访问 ${hostname} 的权限。\n\n` +
        `可能的原因：\n` +
        `• 您在权限对话框中选择了"拒绝"\n` +
        `• 浏览器阻止了权限申请\n\n` +
        `解决方法：\n` +
        `• 重新点击保存按钮再次申请权限\n` +
        `• 检查浏览器是否阻止了弹窗\n` +
        `• 在扩展管理页面手动添加网站权限`
      );
    }
    
    return granted;
  } catch (error) {
    console.error('WebDAV权限请求失败:', error);
    return false;
  }
}

/**
 * 请求书签权限
 * @returns {Promise<boolean>} 是否获得权限
 */
async function requestBookmarksPermission() {
  try {
    // 检查是否已有权限
    const hasPermission = await chrome.permissions.contains({
      permissions: ['bookmarks']
    });
    
    if (hasPermission) {
      return true;
    }
    
    // 请求权限
    const granted = await chrome.permissions.request({
      permissions: ['bookmarks']
    });
    
    return granted;
  } catch (error) {
    console.error('权限请求失败:', error);
    return false;
  }
}

/**
 * 将Chrome书签数据转换为MyTab格式
 * @param {Array} bookmarkTree - Chrome书签树
 * @returns {Promise<Object>} 转换后的数据
 */
async function convertBookmarksToMyTab(bookmarkTree) {
  const { generateId } = await import('./storage.js');
  
  const result = {
    folders: [],
    stats: {
      foldersCount: 0,
      bookmarksCount: 0
    }
  };

  /**
   * 递归转换书签节点
   * @param {Object} node - Chrome书签节点
   * @param {string|null} parentId - 父文件夹ID
   * @returns {Object|null} 转换后的节点
   */
  function convertNode(node, parentId = null) {
    if (node.url) {
      // 书签节点
      result.stats.bookmarksCount++;
      return {
        id: generateId('b'),
        title: node.title || '无标题书签',
        url: node.url,
        icon: '', // 默认为空，由系统自动获取
        dateAdded: node.dateAdded || Date.now()
      };
    } else if (node.children) {
      // 文件夹节点
      const folder = {
        id: generateId('f'),
        name: node.title || '无名文件夹',
        icon: '📁',
        type: 'folder',
        parentId: parentId,
        bookmarks: [],
        children: []
      };

      // 处理子节点
      for (const child of node.children) {
        const converted = convertNode(child, folder.id);
        if (converted) {
          if (converted.url) {
            // 是书签
            folder.bookmarks.push(converted);
          } else {
            // 是子文件夹
            folder.children.push(converted);
          }
        }
      }

      // 只有包含书签或子文件夹的文件夹才被保留
      if (folder.bookmarks.length > 0 || folder.children.length > 0) {
        result.stats.foldersCount++;
        return folder;
      }
    }
    
    return null;
  }

  // 从根节点开始转换，通常是 bookmarkTree[0]
  if (bookmarkTree && bookmarkTree.length > 0) {
    const rootNode = bookmarkTree[0];
    
    console.log('读取到的根书签节点:', rootNode);
    
    if (rootNode.children) {
      // 定义一个临时数组来收集所有要导入的文件夹
      const foldersToImport = [];
      
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
          
          // 处理该系统文件夹下的所有内容
          if (child.children) {
            for (const subItem of child.children) {
              const converted = convertNode(subItem, systemFolder.id);
              if (converted) {
                if (converted.url) {
                  // 是书签
                  systemFolder.bookmarks.push(converted);
                } else {
                  // 是子文件夹
                  systemFolder.children.push(converted);
                }
              }
            }
          }
          
          // 只有当有内容时才添加该文件夹
          if (systemFolder.bookmarks.length > 0 || systemFolder.children.length > 0) {
            result.stats.foldersCount++;
            foldersToImport.push(systemFolder);
          }
        } else {
          // 非系统文件夹，直接转换
          const converted = convertNode(child, null);
          if (converted) {
            foldersToImport.push(converted);
          }
        }
      }
      
      // 将收集到的所有文件夹添加到结果中
      result.folders = foldersToImport;
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
 * 显示导入确认对话框
 * @param {Object} importedData - 转换后的书签数据
 * @returns {Promise<boolean>} 用户是否确认导入
 */
async function showImportConfirmDialog(importedData) {
  const { stats } = importedData;
  
  const message = 
    `准备导入以下数据：\n\n` +
    `文件夹数量：${stats.foldersCount} 个\n` +
    `书签数量：${stats.bookmarksCount} 个\n\n` +
    `导入方式：将新数据添加到现有数据之后（不会覆盖现有数据）\n\n` +
    `是否继续？`;
  
  return confirm(message);
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
