import { DEFAULT_SETTINGS, readAll, writeSettings } from '../scripts/storage.js';
import { WebDAVClient } from '../scripts/webdav.js';

// 初始化安装/更新
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await readAll();
  if (!settings || !('backup' in settings)) {
    await writeSettings(DEFAULT_SETTINGS);
  }
  await ensureAlarm();
});

// 插件启动时检查云端数据
chrome.runtime.onStartup.addListener(async () => {
  await checkCloudDataOnStartup();
});

// 扩展激活时也检查（用户打开新标签页时）
let lastCheckTime = 0;
chrome.tabs.onActivated.addListener(async () => {
  // 防止频繁检查，每5分钟最多检查一次
  const now = Date.now();
  if (now - lastCheckTime > 5 * 60 * 1000) {
    lastCheckTime = now;
    await checkCloudDataOnStartup();
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) {
    await ensureAlarm();
  }
  // 数据变化触发节流备份
  if (area === 'local' && changes.data) {
    // 将来源标记为 auto（操作型）
    scheduleBackup('auto');
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'mytab:auto-backup') {
    await doBackup('alarm');
  }
});

async function ensureAlarm() {
  const { settings } = await readAll();
  const hours = Math.max(0.25, settings?.backup?.frequencyHours ?? 4);
  const periodMinutes = hours * 60;
  await chrome.alarms.clear('mytab:auto-backup');
  if (settings?.backup?.enabled) {
    await chrome.alarms.create('mytab:auto-backup', { delayInMinutes: 1, periodInMinutes: periodMinutes });
  }
}

let backupTimer = null;
let backupSource = 'auto';
function scheduleBackup(source = 'auto') {
  clearTimeout(backupTimer);
  backupSource = source;
  backupTimer = setTimeout(() => doBackup(backupSource), 4000); // 4 秒防抖
}

async function doBackup(source = 'manual') {
  try {
    const { data, settings } = await readAll();
    if (!settings?.webdav?.url) return;
    const client = new WebDAVClient(settings.webdav);
    const prefixMap = { 
      alarm: 'snapshot_schedule', 
      manual: 'snapshot_user', 
      auto: 'snapshot_handle',
      sync_backup: 'sync_backup' // 同步前的安全备份
    };
    const prefix = prefixMap[source] || 'snapshot_user';
    const name = `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    // 在 worker 内避免被缓存污染：重新读取并深拷贝
    const cleanData = JSON.parse(JSON.stringify(data || {}));
    if (cleanData && typeof cleanData === 'object') {
      delete cleanData.history; // 旧版残留清除
      // 兼容旧快照字段结构，确保不把 settings 写入
      if (cleanData.settings) delete cleanData.settings;
      // 不上传本地缓存的图片数据，避免快照过大
      try { stripIconDataUrls(cleanData); } catch (e) {}
    }
    const payload = { version: 1, ts: Date.now(), data: cleanData };
    await client.ensureBase();
    await client.uploadJSON(name, payload);
    const files = await client.list();
    const max = Math.max(1, settings.backup?.maxSnapshots ?? 100);
    if (files.length > max) {
      const toDelete = files.sort((a,b) => a.lastmod - b.lastmod).slice(0, files.length - max);
      for (const f of toDelete) {
        await client.remove(f.name);
      }
    }
    if (source !== 'sync_backup') { // 同步备份不显示通知
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icon128.png', title: 'MyTab 备份成功', message: `已备份：${name}`
      }, () => {});
    }
  } catch (e) {
    console.warn('备份失败', e);
    if (source !== 'sync_backup') { // 同步备份失败也不显示通知，避免干扰
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icon128.png', title: 'MyTab 备份失败', message: String(e?.message || e)
      }, () => {});
    }
  }
}

// 消息路由
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'favicon:fetch') {
        const { pageUrl } = msg;
        const out = await collectFaviconsInBg(pageUrl);
        sendResponse({ ok: true, icons: out });
        return;
      }
      if (msg?.type === 'title:fetch') {
        const { url } = msg;
        const title = await fetchTitle(url);
        sendResponse({ title });
        return;
      }

      if (msg?.type === 'backup:manual') {
        const src = msg?.source || 'manual';
        await doBackup(src);
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === 'backup:list') {
        const { settings } = await readAll();
        const client = new WebDAVClient(settings.webdav);
        await client.ensureBase();
        const list = await client.list();
        sendResponse({ ok: true, list });
        return;
      }
      if (msg?.type === 'backup:restore') {
        const { name } = msg;
        const { settings } = await readAll();
        const client = new WebDAVClient(settings.webdav);
        const json = await client.downloadJSON(name);
        // 覆盖式恢复：仅使用 data 字段
        const restored = json?.data || {};
        await chrome.storage.local.set({ data: restored });
        sendResponse({ ok: true });
        chrome.runtime.sendMessage({ type: 'data:changed' }).catch(() => {});
        return;
      }
      if (msg?.type === 'webdav:test') {
        const { config } = msg;
        const client = new WebDAVClient(config);
        await client.ensureBase();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === 'cloud:check') {
        const result = await checkCloudDataOnStartup();
        sendResponse({ ok: true, result });
        return;
      }
      if (msg?.type === 'cloud:sync') {
        const { fileName } = msg;
        const result = await syncFromCloud(fileName);
        sendResponse({ ok: true, result });
        return;
      }
      if (msg?.type === 'cloud:manual-check') {
        const result = await checkCloudDataOnStartup();
        sendResponse({ ok: true, result });
        return;
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});

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

async function collectFaviconsInBg(pageUrl) {
  const u = new URL(pageUrl);
  const origin = u.origin;
  const abs = (href) => {
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith('//')) return u.protocol + href;
    if (href.startsWith('/')) return origin + href;
    return origin + '/' + href.replace(/^\./, '');
  };
  const icons = new Set();
  // 常见路径
  [
    '/favicon.ico',
    '/favicon.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png'
  ].forEach(p => icons.add(origin + p));

  try {
    const html = await fetch(pageUrl, { method: 'GET' }).then(r => r.text());
    // 链接图标
    const linkRe = /<link[^>]+>/gi; let m;
    while ((m = linkRe.exec(html)) !== null) {
      const tag = m[0];
      const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() || '';
      if (!/(icon|shortcut icon|apple-touch-icon)/.test(rel)) continue;
      const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
      if (href) icons.add(abs(href));
    }
    // og:image
    const og = /<meta[^>]+property=["']og:image["'][^>]*>/gi;
    let m2; while ((m2 = og.exec(html)) !== null) {
      const tag = m2[0];
      const content = /content=["']([^"']+)["']/i.exec(tag)?.[1];
      if (content) icons.add(abs(content));
    }
    // 常见 logo
    const logoRe = /<img[^>]+src=["']([^"']+logo[^"']+)["']/gi; let m3;
    while ((m3 = logoRe.exec(html)) !== null) icons.add(abs(m3[1]));
  } catch (e) {}

  // 过滤非图片或过大的路径：用 HEAD 验证 content-type
  const checks = await Promise.all([...icons].map(async (href) => {
    try {
      const res = await fetch(href, { method: 'HEAD' });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && /image\//.test(ct)) return href;
    } catch (e) {}
    return null;
  }));
  const domain = u.hostname;
  const s2 = [
    `https://www.google.com/s2/favicons?sz=64&domain=${domain}`,
    `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(pageUrl)}`
  ];
  return [...new Set([...checks.filter(Boolean), ...s2])];
}

// 获取网站标题
async function fetchTitle(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  } catch (e) {
    return '';
  }
}

// 检查云端是否有更新的数据
async function checkCloudDataOnStartup() {
  try {
    const { data: localData, settings } = await readAll();
    if (!settings?.webdav?.url || !settings?.backup?.enabled) {
      return null;
    }
    
    const client = new WebDAVClient(settings.webdav);
    await client.ensureBase();
    const files = await client.list();
    
    // 过滤掉同步备份文件（sync_backup前缀），只比较真实的数据快照
    const validFiles = files.filter(f => 
      f.name.endsWith('.json') && 
      !f.name.startsWith('sync_backup_')
    );
    
    if (validFiles.length === 0) return null;
    
    // 找到最新的云端文件
    const latestCloudFile = validFiles.sort((a, b) => b.lastmod - a.lastmod)[0];
    
    // 获取本地数据的最后修改时间（使用数据中的时间戳或当前时间）
    const localTimestamp = getLocalDataTimestamp(localData);
    
    // 如果云端文件比本地数据新，返回提示信息
    // 添加时间差阈值，避免因为微小的时间差异导致误判
    const timeDiff = latestCloudFile.lastmod - localTimestamp;
    const threshold = 2000; // 2秒阈值
    
    if (timeDiff > threshold) {
      return {
        hasNewerData: true,
        cloudFile: latestCloudFile,
        cloudTime: new Date(latestCloudFile.lastmod).toLocaleString(),
        localTime: new Date(localTimestamp).toLocaleString()
      };
    }
    
    return { hasNewerData: false };
  } catch (e) {
    console.warn('检查云端数据失败:', e);
    return null;
  }
}

// 获取本地数据的时间戳
function getLocalDataTimestamp(localData) {
  // 尝试从数据中获取最后修改时间
  if (localData?.lastModified) {
    return localData.lastModified;
  }
  
  // 如果没有时间戳，使用文件夹或书签的最新创建/修改时间
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
  
  // 如果找不到任何时间戳，返回一个很早的时间，确保云端数据会被认为是更新的
  return latestTime || new Date('2020-01-01').getTime();
}

// 从云端同步数据
async function syncFromCloud(fileName) {
  try {
    const { settings } = await readAll();
    if (!settings?.webdav?.url) throw new Error('WebDAV未配置');
    
    const client = new WebDAVClient(settings.webdav);
    
    // 同步前先备份当前本地数据（使用特殊前缀）
    await doBackup('sync_backup');
    
    // 下载云端数据
    const cloudData = await client.downloadJSON(fileName);
    const restored = cloudData?.data || {};
    
    // 添加同步时间戳
    restored.lastModified = Date.now();
    restored.syncedFrom = fileName;
    restored.syncedAt = new Date().toISOString();
    
    // 覆盖本地数据
    await chrome.storage.local.set({ data: restored });
    
    // 通知前端数据已更改
    chrome.runtime.sendMessage({ type: 'data:changed' }).catch(() => {});
    
    return { success: true, fileName, syncedAt: restored.syncedAt };
  } catch (e) {
    console.error('同步失败:', e);
    throw e;
  }
}


