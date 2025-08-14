// 数据与存储层

export const DEFAULT_BG_URL = '../default_bg.jpg';

export const DEFAULT_DATA = {
  folders: [],
  backgroundImage: DEFAULT_BG_URL,
  lastModified: Date.now()
};

export const DEFAULT_SETTINGS = {
  webdav: { url: '', username: '', password: '' },
  backup: { enabled: true, frequencyHours: 4, maxSnapshots: 100 },
  theme: { }
};

export async function readAll() {
  const { data, settings } = await chrome.storage.local.get({ data: DEFAULT_DATA, settings: DEFAULT_SETTINGS });
  return { data, settings };
}

export async function writeAll({ data, settings }) {
  await chrome.storage.local.set({ data, settings });
}

export async function readData() {
  const { data } = await chrome.storage.local.get({ data: DEFAULT_DATA });
  return data;
}

export async function writeData(data) {
  await chrome.storage.local.set({ data });
}

export async function readSettings() {
  const { settings } = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
  return settings;
}

export async function writeSettings(settings) {
  await chrome.storage.local.set({ settings });
}

// history 已移除，精简存储

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export async function ensureInit() {
  const { data, settings } = await readAll();
  if (!settings || !('backup' in settings)) {
    await writeSettings(DEFAULT_SETTINGS);
  }
  if (!data || !('folders' in data)) {
    await writeData(DEFAULT_DATA);
  }
}

// 业务操作：文件夹 / 书签
export async function addFolder(name) {
  const data = await readData();
  const folder = { id: generateId('f'), name: name || '新文件夹', icon: '📁', bookmarks: [], subfolders: [] };
  data.folders.push(folder);
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return folder;
}

export async function renameFolder(folderId, newName) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return;
  folder.name = newName;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

export async function deleteFolder(folderId) {
  const data = await readData();
  const idx = data.folders.findIndex(f => f.id === folderId);
  if (idx >= 0) {
    const removed = data.folders.splice(idx, 1)[0];
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

export async function addSubfolder(folderId, name) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return null;
  folder.subfolders = folder.subfolders || [];
  const sub = { id: generateId('sf'), name: name || '新建二级', bookmarks: [] };
  folder.subfolders.push(sub);
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return sub;
}

export async function renameSubfolder(folderId, subId, name) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  const sub = folder?.subfolders?.find(s => s.id === subId);
  if (!sub) return;
  sub.name = name;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

export async function deleteSubfolder(folderId, subId) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return;
  const idx = (folder.subfolders || []).findIndex(s => s.id === subId);
  if (idx >= 0) {
    const removed = folder.subfolders.splice(idx, 1)[0];
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

export async function addBookmark({ folderId, subId, url, name, iconUrl, iconDataUrl, mono, remark }) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  if (!target) return null;
  const title = name || guessTitleFromUrl(url);
  const bookmark = { id: generateId('b'), url, name: title, iconType: iconUrl ? 'favicon' : 'mono', iconUrl: iconUrl || '', iconDataUrl: iconDataUrl || '', mono: mono || null, remark: remark || '' };
  target.bookmarks = target.bookmarks || [];
  target.bookmarks.push(bookmark);
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return bookmark;
}

export async function renameBookmark({ folderId, subId, bookmarkId, name }) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return;
  bm.name = name;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

export async function deleteBookmark({ folderId, subId, bookmarkId }) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  if (!target) return;
  const idx = (target.bookmarks || []).findIndex(b => b.id === bookmarkId);
  if (idx >= 0) {
    const removed = target.bookmarks.splice(idx, 1)[0];
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

export async function updateBookmarkMono({ folderId, subId, bookmarkId, letter, color }) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return;
  bm.iconType = 'mono';
  bm.iconUrl = '';
  bm.mono = { letter: (letter || (bm.name || bm.url || 'W')[0] || 'W').toUpperCase(), color: color || pickColorFromString(letter || bm.name || bm.url || 'W') };
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

export async function updateBookmarkFavicon({ folderId, subId, bookmarkId, iconUrl }) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return;
  bm.iconType = 'favicon';
  bm.iconUrl = iconUrl || buildFaviconUrl(bm.url);
  bm.mono = null;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

export async function updateBookmark({ folderId, subId, bookmarkId, url, name, iconType, iconUrl, iconDataUrl, mono }) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return;
  if (url !== undefined) bm.url = url;
  if (name !== undefined) bm.name = name;
  if (iconType === 'favicon') { bm.iconType = 'favicon'; bm.iconUrl = iconUrl || buildFaviconUrl(bm.url); if (iconDataUrl !== undefined) bm.iconDataUrl = iconDataUrl || ''; bm.mono = null; }
  if (iconType === 'mono') { bm.iconType = 'mono'; bm.iconUrl = ''; bm.iconDataUrl = ''; bm.mono = mono || bm.mono; }
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

export async function updateBookmarkRemark({ folderId, subId, bookmarkId, remark }) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return;
  bm.remark = remark || '';
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

// 移动书签到目标文件夹/二级文件夹
export async function moveBookmark({ sourceFolderId, sourceSubId, bookmarkId, targetFolderId, targetSubId }) {
  const data = await readData();
  const src = locateContainer(data, sourceFolderId, sourceSubId || null);
  const dst = locateContainer(data, targetFolderId, targetSubId || null);
  if (!src || !dst) return false;
  const idx = (src.bookmarks || []).findIndex(b => b.id === bookmarkId);
  if (idx < 0) return false;
  const [bm] = src.bookmarks.splice(idx, 1);
  dst.bookmarks = dst.bookmarks || [];
  dst.bookmarks.push(bm);
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return true;
}

// 拖拽排序：sourceId 拖到 targetId 之前
export async function reorderBookmarksRelative({ folderId, subId, sourceId, targetId }) {
  const data = await readData();
  const container = locateContainer(data, folderId, subId);
  if (!container) return;
  const list = container.bookmarks || [];
  const from = list.findIndex(b => b.id === sourceId);
  const to = list.findIndex(b => b.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [item] = list.splice(from, 1);
  const insertIndex = from < to ? to - 1 : to;
  list.splice(insertIndex, 0, item);
  container.bookmarks = list;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

export function locateContainer(data, folderId, subId) {
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return null;
  if (!subId) return folder;
  return (folder.subfolders || []).find(s => s.id === subId) || null;
}

export function guessTitleFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

export function buildFaviconUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch (e) { return ''; }
}

function pickColorFromString(s) {
  const colors = ['#7c5cff', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#22c55e'];
  const idx = Math.abs(hashCode(String(s))) % colors.length;
  return colors[idx];
}

function hashCode(str) {
  let h = 0; for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; } return h;
}

export function notifyChanged() {
  chrome.runtime.sendMessage({ type: 'data:changed' }).catch(() => {});
}
