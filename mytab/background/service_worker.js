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

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) {
    await ensureAlarm();
  }
  // 数据变化触发节流备份
  if (area === 'local' && changes.data) {
    scheduleBackup();
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
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => doBackup('auto'), 4000); // 4 秒防抖
}

async function doBackup(source = 'manual') {
  try {
    const { data, settings } = await readAll();
    if (!settings?.webdav?.url) return;
    const client = new WebDAVClient(settings.webdav);
    const name = `snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    // 在 worker 内避免被缓存污染：重新读取并深拷贝
    const cleanData = JSON.parse(JSON.stringify(data || {}));
    if (cleanData && typeof cleanData === 'object') {
      delete cleanData.history; // 旧版残留清除
      // 兼容旧快照字段结构，确保不把 settings 写入
      if (cleanData.settings) delete cleanData.settings;
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
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon128.png', title: 'MyTab 备份成功', message: `已备份：${name}`
    }, () => {});
  } catch (e) {
    console.warn('备份失败', e);
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon128.png', title: 'MyTab 备份失败', message: String(e?.message || e)
    }, () => {});
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
      if (msg?.type === 'backup:manual') {
        await doBackup('manual');
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
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});

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
