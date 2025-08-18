// 非扩展环境下的 chrome API 兼容层（Web 模式）
// 目标：尽量复用现有前端代码，无需改动业务层
(function () {
  if (typeof window === 'undefined') return;
  if (window.chrome && window.chrome.storage && window.chrome.runtime) return; // 扩展环境下不干预

  const STORAGE_KEY_DATA = 'mytab:data';
  const STORAGE_KEY_SETTINGS = 'mytab:settings';

  // 简易事件系统
  const storageChangedListeners = [];
  const runtimeMessageListeners = [];

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch (e) { return fallback; }
  }

  function readLocal(key, defaultValue) {
    if (key === 'data') {
      const raw = localStorage.getItem(STORAGE_KEY_DATA);
      return raw ? safeParse(raw, defaultValue) : defaultValue;
    }
    if (key === 'settings') {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      return raw ? safeParse(raw, defaultValue) : defaultValue;
    }
    return defaultValue;
  }

  function writeLocal(obj) {
    const changes = {};
    if ('data' in obj) {
      const oldRaw = localStorage.getItem(STORAGE_KEY_DATA);
      const oldVal = oldRaw ? safeParse(oldRaw, null) : undefined;
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(obj.data));
      changes.data = { oldValue: oldVal, newValue: obj.data };
    }
    if ('settings' in obj) {
      const oldRaw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      const oldVal = oldRaw ? safeParse(oldRaw, null) : undefined;
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(obj.settings));
      changes.settings = { oldValue: oldVal, newValue: obj.settings };
    }
    if (Object.keys(changes).length > 0) {
      // 通知 storage.onChanged
      storageChangedListeners.forEach(fn => {
        try { fn(changes, 'local'); } catch (e) {}
      });
    }
  }

  // runtime 消息：在单页内模拟（无 Service Worker）
  async function dispatchRuntimeMessage(message) {
    // 内建路由：处理原本在 worker 中的能力
    const type = message && message.type;
    try {
      if (type === 'favicon:fetch') {
        const out = await collectFaviconsInPage(message.pageUrl);
        return { ok: true, icons: out };
      }
      if (type === 'backup:manual') {
        await doBackup(message.source || 'manual');
        return { ok: true };
      }
      if (type === 'backup:list') {
        const items = await listSnapshots();
        return { ok: true, list: items };
      }
      if (type === 'backup:restore') {
        await restoreSnapshot(message.name);
        return { ok: true };
      }
      if (type === 'webdav:test') {
        const ok = await testWebDav(message.config);
        return ok ? { ok: true } : { ok: false, error: '连接失败' };
      }
      if (type === 'cloud:check') {
        const result = await checkCloudDataInWeb();
        return { ok: true, result };
      }
      if (type === 'cloud:sync') {
        const result = await syncFromCloudInWeb(message.fileName);
        return { ok: true, result };
      }
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }

    // 让页面侧监听器有机会处理（如 data:changed）
    let responded = false;
    let responseVal = undefined;
    const sendResponse = (val) => { responded = true; responseVal = val; };
    for (const fn of runtimeMessageListeners) {
      try {
        const maybe = fn(message, null, sendResponse);
        if (maybe === true) {
          // 监听器声明了异步，将在稍后调用 sendResponse；此处简单等待一拍
          await new Promise(r => setTimeout(r, 0));
        }
      } catch (e) {}
    }
    return responded ? responseVal : undefined;
  }

  // WebDAV 相关实现（按需动态 import）
  async function getWebDavClient(config) {
    const mod = await import('./webdav.js');
    return new mod.WebDAVClient(config);
  }

  async function readAllFromShim() {
    const DEFAULT_BG_URL = 'https://qiniu.markup.com.cn/20250814115835258.jpg';
    const DEFAULT_DATA = { folders: [], backgroundImage: DEFAULT_BG_URL, lastModified: Date.now() };
    const DEFAULT_SETTINGS = { webdav: { url: '', username: '', password: '' }, backup: { enabled: true, frequencyHours: 4, maxSnapshots: 100 }, theme: {} };
    const data = readLocal('data', DEFAULT_DATA);
    const settings = readLocal('settings', DEFAULT_SETTINGS);
    return { data, settings };
  }

  async function writeAllFromShim(obj) {
    writeLocal(obj || {});
  }

  function stripIconDataUrls(data) {
    if (!data || !Array.isArray(data.folders)) return;
    data.folders.forEach(folder => {
      if (Array.isArray(folder.bookmarks)) {
        folder.bookmarks.forEach(b => { if (b && 'iconDataUrl' in b) delete b.iconDataUrl; });
      }
      if (Array.isArray(folder.subfolders)) {
        folder.subfolders.forEach(sub => {
          if (Array.isArray(sub.bookmarks)) {
            sub.bookmarks.forEach(b => { if (b && 'iconDataUrl' in b) delete b.iconDataUrl; });
          }
        });
      }
    });
  }

  async function doBackup(source) {
    const { data, settings } = await readAllFromShim();
    if (!settings || !settings.webdav || !settings.webdav.url) return;
    const client = await getWebDavClient(settings.webdav);
    const prefixMap = { 
      alarm: 'snapshot_schedule', 
      manual: 'snapshot_user', 
      auto: 'snapshot_handle',
      sync_backup: 'sync_backup'  // 添加同步备份前缀
    };
    const prefix = prefixMap[source] || 'snapshot_user';
    
    // 直接使用时间戳数字作为文件名，避免时区转换问题
    const dataTimestamp = data?.lastModified || Date.now();
    const name = `${prefix}_${dataTimestamp}.json`;
    
    const cleanData = JSON.parse(JSON.stringify(data || {}));
    if (cleanData && typeof cleanData === 'object') {
      if (cleanData.history) delete cleanData.history;
      if (cleanData.settings) delete cleanData.settings;
      try { stripIconDataUrls(cleanData); } catch (e) {}
    }
    const payload = { version: 1, ts: dataTimestamp, data: cleanData };
    await client.ensureBase();
    await client.uploadJSON(name, payload);
    const files = await client.list();
    const max = Math.max(1, settings.backup && settings.backup.maxSnapshots || 100);
    if (files.length > max) {
      const toDelete = files.slice().sort((a,b) => a.lastmod - b.lastmod).slice(0, files.length - max);
      for (const f of toDelete) { await client.remove(f.name); }
    }
    
    // 备份成功后，本地数据的时间戳已经是正确的，无需更新
  }

  async function listSnapshots() {
    const { settings } = await readAllFromShim();
    const client = await getWebDavClient(settings.webdav);
    await client.ensureBase();
    return await client.list();
  }

  async function restoreSnapshot(name) {
    const { settings } = await readAllFromShim();
    const client = await getWebDavClient(settings.webdav);
    const json = await client.downloadJSON(name);
    const restored = (json && json.data) || {};
    await writeAllFromShim({ data: restored });
    // 页面内广播数据变化
    try { await dispatchRuntimeMessage({ type: 'data:changed' }); } catch (e) {}
  }

  async function testWebDav(config) {
    const client = await getWebDavClient(config);
    await client.ensureBase();
    return true;
  }

  async function collectFaviconsInPage(pageUrl) {
    try {
      // 动态导入共享的图标获取函数
      const { collectFavicons } = await import('./favicon-utils.js');
      
      // 图标验证函数：在Web环境中验证图标
      const validateIcon = async (href) => {
        try {
          const res = await fetch(href, { method: 'HEAD' });
          const ct = res.headers.get('content-type') || '';
          if (res.ok && /image\//.test(ct)) return href;
        } catch (e) {}
        return null;
      };

      // 使用统一的图标收集逻辑
      return await collectFavicons(pageUrl, fetch, validateIcon);
    } catch (e) {
      console.warn('图标收集失败:', e);
      return [];
    }
  }

  // 云端数据检查功能（Web版本）
  async function checkCloudDataInWeb() {
    try {
      const { data: localData, settings } = await readAllFromShim();
      if (!settings?.webdav?.url || !settings?.backup?.enabled) {
        console.log('WebDAV未配置或自动备份未启用，跳过云端检查');
        return null;
      }
      
      const client = await getWebDavClient(settings.webdav);
      await client.ensureBase();
      
      const files = await client.list();
      const validFiles = files.filter(f => 
        f.name.endsWith('.json') && 
        !f.name.startsWith('sync_backup_')
      );
      
      if (validFiles.length === 0) {
        console.log('云端无有效数据备份文件');
        return null;
      }
      
      const latestCloudFile = validFiles.sort((a, b) => b.lastmod - a.lastmod)[0];
      const localTimestamp = getLocalDataTimestamp(localData);
      const cloudTimestamp = extractTimestampFromFileName(latestCloudFile.name);
      
      if (!cloudTimestamp) {
        console.warn('无法从文件名提取时间戳:', latestCloudFile.name);
        return { hasNewerData: false, error: '无法解析文件名时间戳' };
      }
      
      const timeDiff = cloudTimestamp - localTimestamp;
      const threshold = 2000;
      
      console.log('云端数据检查完成:', {
        云端文件名: latestCloudFile.name,
        云端时间戳: cloudTimestamp,
        本地时间戳: localTimestamp,
        时间差异: timeDiff,
        需要同步: timeDiff > threshold
      });
      
      if (timeDiff > threshold) {
        return {
          hasNewerData: true,
          cloudFile: latestCloudFile,
          cloudTime: new Date(cloudTimestamp).toLocaleString(),
          localTime: new Date(localTimestamp).toLocaleString(),
          timeDifference: Math.round(timeDiff / 1000) + '秒'
        };
      }
      
      return { hasNewerData: false };
    } catch (e) {
      console.warn('检查云端数据失败:', e);
      return null;
    }
  }

  // 从文件名提取时间戳
  function extractTimestampFromFileName(fileName) {
    try {
      // 新格式：直接匹配13位数字时间戳
      const newFormatMatch = fileName.match(/(\d{13})\.json$/);
      if (newFormatMatch) {
        const timestamp = parseInt(newFormatMatch[1], 10);
        return isNaN(timestamp) ? null : timestamp;
      }
      
      // 旧格式：解析ISO日期时间格式
      const oldFormatMatch = fileName.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/);
      if (oldFormatMatch) {
        const timeStr = oldFormatMatch[1];
        const isoString = timeStr.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
        const timestamp = new Date(isoString).getTime();
        return isNaN(timestamp) ? null : timestamp;
      }
      
      return null;
    } catch (e) {
      console.warn('解析文件名时间戳失败:', fileName, e);
      return null;
    }
  }

  // 获取本地数据时间戳
  function getLocalDataTimestamp(localData) {
    if (localData?.lastModified) {
      return localData.lastModified;
    }
    
    let latestTime = 0;
    
    if (localData?.folders) {
      localData.folders.forEach(folder => {
        if (folder.createdAt) latestTime = Math.max(latestTime, folder.createdAt);
        if (folder.updatedAt) latestTime = Math.max(latestTime, folder.updatedAt);
        
        if (folder.bookmarks) {
          folder.bookmarks.forEach(bookmark => {
            if (bookmark.createdAt) latestTime = Math.max(latestTime, bookmark.createdAt);
            if (bookmark.updatedAt) latestTime = Math.max(latestTime, bookmark.updatedAt);
          });
        }
        
        if (folder.subfolders) {
          folder.subfolders.forEach(subfolder => {
            if (subfolder.createdAt) latestTime = Math.max(latestTime, subfolder.createdAt);
            if (subfolder.updatedAt) latestTime = Math.max(latestTime, subfolder.updatedAt);
            
            if (subfolder.bookmarks) {
              subfolder.bookmarks.forEach(bookmark => {
                if (bookmark.createdAt) latestTime = Math.max(latestTime, bookmark.createdAt);
                if (bookmark.updatedAt) latestTime = Math.max(latestTime, bookmark.updatedAt);
              });
            }
          });
        }
      });
    }
    
    return latestTime || new Date('2020-01-01').getTime();
  }

  // 从云端同步数据（Web版本）
  async function syncFromCloudInWeb(fileName) {
    try {
      const { settings } = await readAllFromShim();
      if (!settings?.webdav?.url) {
        throw new Error('WebDAV未配置');
      }
      
      const client = await getWebDavClient(settings.webdav);
      
      // 同步前备份
      await doBackup('sync_backup');
      console.log('已创建本地数据备份，准备同步');
      
      // 下载云端数据
      const cloudData = await client.downloadJSON(fileName);
      const restored = cloudData?.data || {};
      
      // 设置时间戳和元信息
      const fileTimestamp = extractTimestampFromFileName(fileName);
      const originalTimestamp = fileTimestamp || cloudData?.ts || restored.lastModified || Date.now();
      
      restored.lastModified = originalTimestamp;
      restored.syncedFrom = fileName;
      restored.syncedAt = new Date().toISOString();
      
      // 更新本地数据
      await writeAllFromShim({ data: restored });
      console.log('云端数据已成功同步到本地');
      
      // 通知数据变化
      try { await dispatchRuntimeMessage({ type: 'data:changed' }); } catch (e) {}
      
      return { 
        success: true, 
        fileName, 
        syncedAt: restored.syncedAt 
      };
    } catch (e) {
      console.error('同步失败:', e);
      throw e;
    }
  }

  // 简易自动备份调度：监听数据变化后 4 秒触发一次
  let backupTimer = null;
  function scheduleAutoBackup() {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(async () => {
      try {
        const { settings } = await readAllFromShim();
        if (settings && settings.backup && settings.backup.enabled) {
          await doBackup('auto');
        }
      } catch (e) {}
    }, 4000);
  }

  // 构建 chrome 兼容层
  window.chrome = {
    storage: {
      local: {
        get: async (query) => {
          // query 可能是 { data: DEFAULT, settings: DEFAULT }
          const out = {};
          if (query && typeof query === 'object') {
            for (const key of Object.keys(query)) {
              out[key] = readLocal(key, query[key]);
            }
            return out;
          }
          return {
            data: readLocal('data', null),
            settings: readLocal('settings', null)
          };
        },
        set: async (obj) => {
          writeLocal(obj || {});
        }
      },
      onChanged: {
        addListener: (fn) => { if (typeof fn === 'function') storageChangedListeners.push(fn); }
      }
    },
    runtime: {
      sendMessage: async (msg) => {
        const res = await dispatchRuntimeMessage(msg);
        return res;
      },
      onMessage: {
        addListener: (fn) => { if (typeof fn === 'function') runtimeMessageListeners.push(fn); }
      },
      openOptionsPage: () => { try { window.location.href = 'options.html'; } catch (e) {} }
    },
    permissions: {
      contains: async () => false,
      request: async () => true
    },
    notifications: {
      create: (_opts, cb) => { try { console.log('[MyTab]', _opts && _opts.title || '通知'); } catch (e) {} if (cb) cb(); }
    }
  };

  // 监听存储变化，派发 data:changed 给页面 & 触发自动备份
  chrome.storage.onChanged.addListener((changes, area) => {
    try {
      dispatchRuntimeMessage({ type: 'data:changed' });
    } catch (e) {}
    if (area === 'local' && changes && (changes.data || changes.settings)) {
      scheduleAutoBackup();
    }
  });

  // 在 Web 模式启用代理标记
  try { window.__MYTAB_USE_PROXY__ = true; } catch (e) {}
})();

