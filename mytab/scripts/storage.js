/**
 * 数据与存储层
 * 负责管理Chrome扩展的本地存储，包括书签数据和设置信息
 */

// 默认背景图片URL
export const DEFAULT_BG_URL = 'https://qiniu.markup.com.cn/20250814195424790.jpg';

// 默认数据结构
export const DEFAULT_DATA = {
  folders: [], // 文件夹列表，每个文件夹包含书签和子文件夹
  backgroundImage: DEFAULT_BG_URL, // 背景图片URL
  lastModified: Date.now() // 最后修改时间戳
};

// 默认设置结构
export const DEFAULT_SETTINGS = {
  webdav: {
    url: '', // WebDAV服务器地址
    username: '', // WebDAV用户名
    password: '' // WebDAV密码
  },
  backup: {
    enabled: true, // 是否启用备份
    frequencyHours: 4, // 备份频率（小时）
    maxSnapshots: 100 // 最大快照数量
  },
  theme: {} // 主题设置（预留）
};

/**
 * 读取所有存储数据（数据和设置）
 * @returns {Promise<{data: Object, settings: Object}>} 包含数据和设置的对象
 */
export async function readAll() {
  const {
    data,
    settings
  } = await chrome.storage.local.get({
    data: DEFAULT_DATA,
    settings: DEFAULT_SETTINGS
  });
  return {
    data,
    settings
  };
}

/**
 * 写入所有存储数据（数据和设置）
 * @param {Object} param0 - 包含data和settings的对象
 * @param {Object} param0.data - 书签数据
 * @param {Object} param0.settings - 设置数据
 */
export async function writeAll({
  data,
  settings
}) {
  await chrome.storage.local.set({
    data,
    settings
  });
}

/**
 * 读取书签数据
 * @returns {Promise<Object>} 书签数据对象
 */
export async function readData() {
  const {
    data
  } = await chrome.storage.local.get({
    data: DEFAULT_DATA
  });
  return data;
}

/**
 * 写入书签数据
 * @param {Object} data - 要写入的书签数据
 */
export async function writeData(data) {
  await chrome.storage.local.set({
    data
  });
}

/**
 * 读取设置数据
 * @returns {Promise<Object>} 设置数据对象
 */
export async function readSettings() {
  const {
    settings
  } = await chrome.storage.local.get({
    settings: DEFAULT_SETTINGS
  });
  return settings;
}

/**
 * 写入设置数据
 * @param {Object} settings - 要写入的设置数据
 */
export async function writeSettings(settings) {
  await chrome.storage.local.set({
    settings
  });
}

// 注意：history 功能已移除，精简存储结构

/**
 * 生成唯一ID
 * @param {string} prefix - ID前缀，默认为'id'
 * @returns {string} 格式为 prefix_时间戳_随机字符串 的唯一ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 深度克隆对象
 * @param {Object} obj - 要克隆的对象
 * @returns {Object} 克隆后的新对象
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 确保存储初始化
 * 检查并初始化默认的数据和设置结构
 */
export async function ensureInit() {
  const {
    data,
    settings
  } = await readAll();
  // 如果设置不存在或缺少backup字段，则初始化默认设置
  if (!settings || !('backup' in settings)) {
    await writeSettings(DEFAULT_SETTINGS);
  }
  // 如果数据不存在或缺少folders字段，则初始化默认数据
  if (!data || !('folders' in data)) {
    await writeData(DEFAULT_DATA);
  }
}

/**
 * ===========================================
 * 业务操作：文件夹管理
 * ===========================================
 */

/**
 * 添加新文件夹
 * @param {string} name - 文件夹名称，默认为'新文件夹'
 * @returns {Promise<Object>} 创建的文件夹对象
 */
export async function addFolder(name) {
  const data = await readData();
  const folder = {
    id: generateId('f'), // 生成文件夹ID，前缀为'f'
    name: name || '新文件夹', // 文件夹名称
    icon: '📁', // 文件夹图标
    bookmarks: [], // 书签列表
    subfolders: [] // 子文件夹列表
  };
  data.folders.push(folder);
  data.lastModified = Date.now(); // 更新修改时间
  await writeData(data);
  notifyChanged(); // 通知数据变更
  return folder;
}

/**
 * 重命名文件夹
 * @param {string} folderId - 文件夹ID
 * @param {string} newName - 新的文件夹名称
 */
export async function renameFolder(folderId, newName) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return; // 文件夹不存在则返回

  folder.name = newName;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

/**
 * 删除文件夹
 * @param {string} folderId - 要删除的文件夹ID
 */
export async function deleteFolder(folderId) {
  const data = await readData();
  const idx = data.folders.findIndex(f => f.id === folderId);
  if (idx >= 0) {
    data.folders.splice(idx, 1); // 从数组中移除文件夹
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

/**
 * ===========================================
 * 业务操作：子文件夹管理
 * ===========================================
 */

/**
 * 添加子文件夹
 * @param {string} folderId - 父文件夹ID
 * @param {string} name - 子文件夹名称，默认为'新建二级'
 * @returns {Promise<Object|null>} 创建的子文件夹对象，如果父文件夹不存在则返回null
 */
export async function addSubfolder(folderId, name) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return null; // 父文件夹不存在

  folder.subfolders = folder.subfolders || [];
  const sub = {
    id: generateId('sf'), // 生成子文件夹ID，前缀为'sf'
    name: name || '新建二级', // 子文件夹名称
    bookmarks: [] // 子文件夹内的书签列表
  };
  folder.subfolders.push(sub);
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return sub;
}

/**
 * 重命名子文件夹
 * @param {string} folderId - 父文件夹ID
 * @param {string} subId - 子文件夹ID
 * @param {string} name - 新的子文件夹名称
 */
export async function renameSubfolder(folderId, subId, name) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  const sub = folder && folder.subfolders && folder.subfolders.find(s => s.id === subId);
  if (!sub) return; // 子文件夹不存在则返回

  sub.name = name;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

/**
 * 删除子文件夹
 * @param {string} folderId - 父文件夹ID
 * @param {string} subId - 要删除的子文件夹ID
 */
export async function deleteSubfolder(folderId, subId) {
  const data = await readData();
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return; // 父文件夹不存在则返回

  const idx = (folder.subfolders || []).findIndex(s => s.id === subId);
  if (idx >= 0) {
    folder.subfolders.splice(idx, 1); // 从数组中移除子文件夹
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

/**
 * ===========================================
 * 业务操作：书签管理
 * ===========================================
 */

/**
 * 添加书签
 * @param {Object} params - 书签参数
 * @param {string} params.folderId - 文件夹ID
 * @param {string} [params.subId] - 子文件夹ID（可选）
 * @param {string} params.url - 书签URL
 * @param {string} [params.name] - 书签名称，如果未提供则从URL推测
 * @param {string} [params.iconUrl] - 图标URL
 * @param {string} [params.iconDataUrl] - 图标数据URL（base64）
 * @param {Object} [params.mono] - 单色图标配置
 * @param {string} [params.remark] - 备注信息
 * @returns {Promise<Object|null>} 创建的书签对象，如果目标容器不存在则返回null
 */
export async function addBookmark({
  folderId,
  subId,
  url,
  name,
  iconUrl,
  iconDataUrl,
  mono,
  remark
}) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  if (!target) return null; // 目标容器不存在

  const title = name || guessTitleFromUrl(url); // 如果没有提供名称，从URL推测
  const bookmark = {
    id: generateId('b'), // 生成书签ID，前缀为'b'
    url, // 书签URL
    name: title, // 书签名称
    iconType: iconUrl ? 'favicon' : 'mono', // 图标类型：favicon或mono
    iconUrl: iconUrl || '', // 图标URL
    iconDataUrl: iconDataUrl || '', // 图标数据URL
    mono: mono || null, // 单色图标配置
    remark: remark || '' // 备注信息
  };

  target.bookmarks = target.bookmarks || [];
  target.bookmarks.push(bookmark);
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return bookmark;
}



/**
 * 删除书签
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} [params.subId] - 子文件夹ID（可选）
 * @param {string} params.bookmarkId - 要删除的书签ID
 */
export async function deleteBookmark({
  folderId,
  subId,
  bookmarkId
}) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  if (!target) return; // 目标容器不存在则返回

  const idx = (target.bookmarks || []).findIndex(b => b.id === bookmarkId);
  if (idx >= 0) {
    target.bookmarks.splice(idx, 1); // 从数组中移除书签
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

/**
 * 更新书签为单色图标
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} [params.subId] - 子文件夹ID（可选）
 * @param {string} params.bookmarkId - 书签ID
 * @param {string} [params.letter] - 图标字母，默认取书签名称首字母
 * @param {string} [params.color] - 图标颜色，默认根据字母生成
 */
export async function updateBookmarkMono({
  folderId,
  subId,
  bookmarkId,
  letter,
  color
}) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return; // 书签不存在则返回

  bm.iconType = 'mono'; // 设置图标类型为单色
  bm.iconUrl = ''; // 清空图标URL
  bm.mono = {
    letter: (letter || (bm.name || bm.url || 'W')[0] || 'W').toUpperCase(), // 图标字母，转为大写
    color: color || pickColorFromString(letter || bm.name || bm.url || 'W') // 图标颜色
  };
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}


/**
 * 更新书签信息（通用更新方法）
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} [params.subId] - 子文件夹ID（可选）
 * @param {string} params.bookmarkId - 书签ID
 * @param {string} [params.url] - 新的URL
 * @param {string} [params.name] - 新的名称
 * @param {string} [params.iconType] - 图标类型：'favicon' 或 'mono'
 * @param {string} [params.iconUrl] - 图标URL
 * @param {string} [params.iconDataUrl] - 图标数据URL
 * @param {Object} [params.mono] - 单色图标配置
 */
export async function updateBookmark({
  folderId,
  subId,
  bookmarkId,
  url,
  name,
  iconType,
  iconUrl,
  iconDataUrl,
  mono
}) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return; // 书签不存在则返回

  // 更新基本信息
  if (url !== undefined) bm.url = url;
  if (name !== undefined) bm.name = name;

  // 更新图标信息
  if (iconType === 'favicon') {
    bm.iconType = 'favicon';
    bm.iconUrl = iconUrl || buildFaviconUrl(bm.url);
    if (iconDataUrl !== undefined) bm.iconDataUrl = iconDataUrl || '';
    bm.mono = null;
  }
  if (iconType === 'mono') {
    bm.iconType = 'mono';
    bm.iconUrl = '';
    bm.iconDataUrl = '';
    bm.mono = mono || bm.mono;
  }

  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

/**
 * 更新书签备注
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} [params.subId] - 子文件夹ID（可选）
 * @param {string} params.bookmarkId - 书签ID
 * @param {string} params.remark - 备注内容
 */
export async function updateBookmarkRemark({
  folderId,
  subId,
  bookmarkId,
  remark
}) {
  const data = await readData();
  const target = locateContainer(data, folderId, subId);
  const bm = target?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return; // 书签不存在则返回

  bm.remark = remark || '';
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

/**
 * ===========================================
 * 业务操作：书签移动和排序
 * ===========================================
 */

/**
 * 移动书签到目标文件夹/子文件夹
 * @param {Object} params - 参数对象
 * @param {string} params.sourceFolderId - 源文件夹ID
 * @param {string} [params.sourceSubId] - 源子文件夹ID（可选）
 * @param {string} params.bookmarkId - 要移动的书签ID
 * @param {string} params.targetFolderId - 目标文件夹ID
 * @param {string} [params.targetSubId] - 目标子文件夹ID（可选）
 * @returns {Promise<boolean>} 移动是否成功
 */
export async function moveBookmark({
  sourceFolderId,
  sourceSubId,
  bookmarkId,
  targetFolderId,
  targetSubId
}) {
  const data = await readData();
  const src = locateContainer(data, sourceFolderId, sourceSubId || null);
  const dst = locateContainer(data, targetFolderId, targetSubId || null);

  if (!src || !dst) return false; // 源或目标容器不存在

  const idx = (src.bookmarks || []).findIndex(b => b.id === bookmarkId);
  if (idx < 0) return false; // 书签不存在

  // 从源容器移除书签
  const [bm] = src.bookmarks.splice(idx, 1);

  // 添加到目标容器
  dst.bookmarks = dst.bookmarks || [];
  dst.bookmarks.push(bm);

  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return true;
}

/**
 * 书签拖拽排序：将sourceId书签拖到targetId书签之前
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} [params.subId] - 子文件夹ID（可选）
 * @param {string} params.sourceId - 要移动的书签ID
 * @param {string} params.targetId - 目标位置书签ID
 */
export async function reorderBookmarksRelative({
  folderId,
  subId,
  sourceId,
  targetId
}) {
  const data = await readData();
  const container = locateContainer(data, folderId, subId);
  if (!container) return; // 容器不存在则返回

  const list = container.bookmarks || [];
  const from = list.findIndex(b => b.id === sourceId);
  const to = list.findIndex(b => b.id === targetId);

  if (from < 0 || to < 0 || from === to) return; // 无效的移动操作

  // 执行数组元素移动
  const [item] = list.splice(from, 1); // 移除源位置的元素
  const insertIndex = from < to ? to - 1 : to; // 计算插入位置
  list.splice(insertIndex, 0, item); // 插入到新位置

  container.bookmarks = list;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

/**
 * ===========================================
 * 工具函数
 * ===========================================
 */

/**
 * 定位容器（文件夹或子文件夹）
 * @param {Object} data - 数据对象
 * @param {string} folderId - 文件夹ID
 * @param {string} [subId] - 子文件夹ID（可选）
 * @returns {Object|null} 找到的容器对象，如果不存在则返回null
 */
export function locateContainer(data, folderId, subId) {
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return null; // 文件夹不存在
  if (!subId) return folder; // 没有指定子文件夹，返回文件夹本身
  return (folder.subfolders || []).find(s => s.id === subId) || null;
}

/**
 * 从URL推测标题
 * @param {string} url - 网址
 * @returns {string} 推测的标题（通常是域名）
 */
export function guessTitleFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, ''); // 移除www前缀
  } catch (e) {
    return url; // URL解析失败时返回原URL
  }
}

/**
 * 构建网站图标URL
 * @param {string} url - 网站URL
 * @returns {string} 图标URL，通常是 域名/favicon.ico
 */
export function buildFaviconUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch (e) {
    return ''; // URL解析失败时返回空字符串
  }
}

/**
 * 根据字符串选择颜色
 * @param {string} s - 输入字符串
 * @returns {string} 十六进制颜色值
 */
function pickColorFromString(s) {
  const colors = ['#7c5cff', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#22c55e'];
  const idx = Math.abs(hashCode(String(s))) % colors.length;
  return colors[idx];
}

/**
 * 计算字符串哈希值
 * @param {string} str - 输入字符串
 * @returns {number} 哈希值
 */
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h;
}

/**
 * 通知数据变更
 * 向Chrome扩展的runtime发送数据变更消息
 */
export function notifyChanged() {
  chrome.runtime.sendMessage({
    type: 'data:changed'
  }).catch(() => {
    // 忽略发送失败的错误（可能是没有监听器）
  });
}