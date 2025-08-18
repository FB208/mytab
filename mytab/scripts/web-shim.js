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
        return await checkCloudData();
      }
      if (type === 'cloud:sync') {
        const { settings } = await readAllFromShim();
        const { syncFromCloud } = await import('./cloud-utils.js');
        const result = await syncFromCloud(settings, message.fileName);
        
        if (result.success) {
          await writeAllFromShim({ data: result.data });
          try { await dispatchRuntimeMessage({ type: 'data:changed' }); } catch (e) {}
          return { ok: true };
        } else {
          return { ok: false, error: result.error };
        }
      }
      if (type === 'cloud:manual-check') {
        return await checkCloudData();
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
    const prefixMap = { alarm: 'snapshot_schedule', manual: 'snapshot_user', auto: 'snapshot_handle' };
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

  async function checkCloudData() {
    try {
      const { data, settings } = await readAllFromShim();
      
      // 使用共享的云端检查工具
      const { checkCloudData } = await import('./cloud-utils.js');
      const result = await checkCloudData(settings, data);
      
      if (result.hasNewerData) {
        return {
          ok: true,
          result: {
            hasNewerData: true,
            cloudFile: result.cloudFile,
            cloudTime: result.cloudTime,
            localTime: result.localTime
          }
        };
      } else {
        return {
          ok: true,
          result: { hasNewerData: false }
        };
      }
    } catch (e) {
      console.warn('检查云端数据失败:', e);
      return { ok: false, error: String(e.message || e) };
    }
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

