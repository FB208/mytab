/**
 * 数据与存储层
 * 负责管理Chrome扩展的本地存储，包括书签数据和设置信息
 * 重构为支持无限层级文件夹的树形结构
 */

// 默认背景图片URL
export const DEFAULT_BG_URL = 'https://qiniu.markup.com.cn/20250814195424790.jpg';

// 默认数据结构 - 重构为树形结构
export const DEFAULT_DATA = {
  folders: [], // 文件夹列表，支持无限层级嵌套
  backgroundImage: '', // 背景图片URL（空表示使用系统默认）
  lastModified: new Date('2020-01-01').getTime() // 较早的时间戳，确保云端数据优先
};

// 默认设置结构
export const DEFAULT_SETTINGS = {
  webdav: {
    url: '', // WebDAV服务器地址
    username: '', // WebDAV用户名
    password: '' // WebDAV密码
  },
  backup: {
    enabled: false, // 是否启用备份，默认关闭
    frequencyHours: 4, // 备份频率（小时）
    maxSnapshots: 100 // 最大快照数量
  },
  client: {
    identifier: '' // 客户端标识符，用于区分不同的客户端实例
  },
  locale: {
    mode: 'auto'
  },
  theme: {} // 主题设置（预留）
};

export function withDefaultSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    webdav: {
      ...DEFAULT_SETTINGS.webdav,
      ...(settings?.webdav || {})
    },
    backup: {
      ...DEFAULT_SETTINGS.backup,
      ...(settings?.backup || {})
    },
    client: {
      ...DEFAULT_SETTINGS.client,
      ...(settings?.client || {})
    },
    locale: {
      ...DEFAULT_SETTINGS.locale,
      ...(settings?.locale || {})
    },
    theme: {
      ...DEFAULT_SETTINGS.theme,
      ...(settings?.theme || {})
    }
  };
}

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
    settings: withDefaultSettings(settings)
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
    settings: withDefaultSettings(settings)
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
  return withDefaultSettings(settings);
}

/**
 * 写入设置数据
 * @param {Object} settings - 要写入的设置数据
 */
export async function writeSettings(settings) {
  await chrome.storage.local.set({
    settings: withDefaultSettings(settings)
  });
}

/**
 * 读取图标缓存数据
 * @returns {Promise<Object>} 图标缓存对象，key为iconUrl，value为base64数据
 */
export async function readIconData() {
  const { iconData } = await chrome.storage.local.get({
    iconData: {}
  });
  return iconData;
}

/**
 * 写入图标缓存数据
 * @param {Object} iconData - 图标缓存对象
 */
export async function writeIconData(iconData) {
  await chrome.storage.local.set({ iconData });
}

/**
 * 获取指定图标URL的base64数据
 * @param {string} iconUrl - 图标URL
 * @returns {Promise<string|null>} base64数据，不存在返回null
 */
export async function getIconDataUrl(iconUrl) {
  if (!iconUrl) return null;
  const iconData = await readIconData();
  return iconData[iconUrl] || null;
}

/**
 * 保存指定图标URL的base64数据
 * @param {string} iconUrl - 图标URL
 * @param {string} dataUrl - base64数据
 */
export async function setIconDataUrl(iconUrl, dataUrl) {
  if (!iconUrl) return;
  const iconData = await readIconData();
  iconData[iconUrl] = dataUrl;
  await writeIconData(iconData);
}

/**
 * 删除指定图标URL的缓存数据
 * @param {string} iconUrl - 图标URL
 */
export async function removeIconDataUrl(iconUrl) {
  if (!iconUrl) return;
  const iconData = await readIconData();
  delete iconData[iconUrl];
  await writeIconData(iconData);
}

/**
 * 清空所有图标缓存数据
 */
export async function clearIconData() {
  await writeIconData({});
}

/**
 * 清理无用的图标缓存数据
 * 删除在书签中不再使用的图标缓存
 */
export async function cleanupUnusedIconData() {
  const data = await readData();
  const iconData = await readIconData();
  const usedIconUrls = new Set();
  
  // 递归收集所有使用的图标URL
  function collectIconUrls(folder) {
    if (Array.isArray(folder.bookmarks)) {
      folder.bookmarks.forEach(bookmark => {
        if (bookmark.iconUrl) {
          usedIconUrls.add(bookmark.iconUrl);
        }
      });
    }
    if (Array.isArray(folder.children)) {
      folder.children.forEach(child => collectIconUrls(child));
    }
  }
  
  data.folders.forEach(folder => collectIconUrls(folder));
  
  // 删除未使用的图标数据
  const cleanedIconData = {};
  Object.keys(iconData).forEach(iconUrl => {
    if (usedIconUrls.has(iconUrl)) {
      cleanedIconData[iconUrl] = iconData[iconUrl];
    }
  });
  
  await writeIconData(cleanedIconData);
  console.log(`清理完成，保留${Object.keys(cleanedIconData).length}个图标缓存，清理${Object.keys(iconData).length - Object.keys(cleanedIconData).length}个无用缓存`);
}

/**
 * 生成客户端标识符
 * 5位随机字母和数字组合，不包含下划线
 * @returns {string} 5位字母数字组合的随机字符串
 */
export function generateClientIdentifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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
 * 检查并初始化默认的数据和设置结构，同时迁移旧数据格式
 */
export async function ensureInit() {
  const {
    data,
    settings
  } = await readAll();
  
  // 如果设置不存在或缺少backup字段，则初始化默认设置
  const normalizedSettings = withDefaultSettings(settings);
  if (!settings || JSON.stringify(normalizedSettings) !== JSON.stringify(settings)) {
    await writeSettings(normalizedSettings);
  }
  
  // 如果数据不存在或缺少folders字段，则初始化默认数据
  if (!data || !('folders' in data)) {
    await writeData(DEFAULT_DATA);
    return;
  }
}

/**
 * 检测是否为首次使用（没有任何文件夹和书签）
 * @returns {Promise<boolean>} 如果是首次使用返回true
 */
export async function isFirstTimeUser() {
  const data = await readData();
  // 检查是否没有文件夹，或者只有空文件夹（没有书签）
  if (!data.folders || data.folders.length === 0) {
    return true;
  }
  
  // 检查所有文件夹是否都为空（没有书签）
  const hasAnyBookmarks = data.folders.some(folder => {
    if (folder.bookmarks && folder.bookmarks.length > 0) {
      return true;
    }
    // 递归检查子文件夹
    return hasBookmarksInChildren(folder.children || []);
  });
  
  return !hasAnyBookmarks;
}

/**
 * 递归检查子文件夹是否有书签
 * @param {Array} children - 子文件夹数组
 * @returns {boolean} 如果有书签返回true
 */
function hasBookmarksInChildren(children) {
  return children.some(child => {
    if (child.bookmarks && child.bookmarks.length > 0) {
      return true;
    }
    return hasBookmarksInChildren(child.children || []);
  });
}

/**
 * ===========================================
 * 树形结构工具函数
 * ===========================================
 */

/**
 * 在文件夹树中查找指定ID的文件夹
 * @param {Array} folders - 文件夹数组
 * @param {string} folderId - 要查找的文件夹ID
 * @returns {Object|null} 找到的文件夹对象，如果不存在则返回null
 */
export function findFolderById(folders, folderId) {
  for (const folder of folders) {
    if (folder.id === folderId) {
      return folder;
    }
    if (folder.children && folder.children.length > 0) {
      const found = findFolderById(folder.children, folderId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 获取文件夹的完整路径
 * @param {Array} folders - 文件夹数组
 * @param {string} folderId - 文件夹ID
 * @returns {Array} 从根到目标文件夹的路径数组
 */
export function getFolderPath(folders, folderId) {
  function findPath(folders, targetId, currentPath = []) {
    for (const folder of folders) {
      const newPath = [...currentPath, folder];
      if (folder.id === targetId) {
        return newPath;
      }
      if (folder.children && folder.children.length > 0) {
        const found = findPath(folder.children, targetId, newPath);
        if (found) return found;
      }
    }
    return null;
  }
  return findPath(folders, folderId) || [];
}

/**
 * 获取文件夹的所有子文件夹（平铺列表）
 * @param {Object} folder - 文件夹对象
 * @returns {Array} 所有子文件夹的平铺数组
 */
export function getAllSubfolders(folder) {
  if (!folder || !folder.children) return [];
  
  let result = [];
  for (const child of folder.children) {
    result.push(child);
    result = result.concat(getAllSubfolders(child));
  }
  return result;
}

/**
 * 检查文件夹A是否是文件夹B的祖先
 * @param {Array} folders - 文件夹数组
 * @param {string} ancestorId - 可能的祖先文件夹ID
 * @param {string} descendantId - 可能的后代文件夹ID
 * @returns {boolean} 如果ancestorId是descendantId的祖先则返回true
 */
export function isAncestor(folders, ancestorId, descendantId) {
  const descendantPath = getFolderPath(folders, descendantId);
  return descendantPath.some(folder => folder.id === ancestorId);
}

/**
 * ===========================================
 * 业务操作：文件夹管理
 * ===========================================
 */

/**
 * 添加新文件夹
 * @param {string} name - 文件夹名称，默认为'新文件夹'
 * @param {string} parentId - 父文件夹ID，为null时添加到根级别
 * @returns {Promise<Object>} 创建的文件夹对象
 */
export async function addFolder(name, parentId = null) {
  const data = await readData();
  const folder = {
    id: generateId('f'), // 生成文件夹ID，前缀为'f'
    name: name || '新文件夹', // 文件夹名称
    icon: '📁', // 文件夹图标
    type: 'folder', // 类型标识
    parentId: parentId, // 父文件夹ID
    bookmarks: [], // 书签列表
    children: [] // 子文件夹列表
  };

  if (parentId) {
    // 添加到指定父文件夹
    const parentFolder = findFolderById(data.folders, parentId);
    if (!parentFolder) return null; // 父文件夹不存在
    parentFolder.children = parentFolder.children || [];
    parentFolder.children.push(folder);
  } else {
    // 添加到根级别
    data.folders.push(folder);
  }

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
  const folder = findFolderById(data.folders, folderId);
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
  
  function removeFromArray(folders) {
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].id === folderId) {
        folders.splice(i, 1);
        return true;
      }
      if (folders[i].children && removeFromArray(folders[i].children)) {
        return true;
      }
    }
    return false;
  }

  if (removeFromArray(data.folders)) {
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

/**
 * 移动文件夹到新的父文件夹
 * @param {string} folderId - 要移动的文件夹ID
 * @param {string} newParentId - 新的父文件夹ID，null表示移动到根级别
 * @returns {Promise<boolean>} 移动是否成功
 */
export async function moveFolder(folderId, newParentId) {
  const data = await readData();
  
  // 不能移动到自己或自己的子文件夹
  if (folderId === newParentId || (newParentId && isAncestor(data.folders, folderId, newParentId))) {
    return false;
  }

  // 找到要移动的文件夹
  const folder = findFolderById(data.folders, folderId);
  if (!folder) return false;

  // 从原位置移除
  function removeFromArray(folders) {
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].id === folderId) {
        folders.splice(i, 1);
        return true;
      }
      if (folders[i].children && removeFromArray(folders[i].children)) {
        return true;
      }
    }
    return false;
  }

  if (!removeFromArray(data.folders)) return false;

  // 更新父ID
  folder.parentId = newParentId;

  // 添加到新位置
  if (newParentId) {
    const newParent = findFolderById(data.folders, newParentId);
    if (!newParent) return false;
    newParent.children = newParent.children || [];
    newParent.children.push(folder);
  } else {
    data.folders.push(folder);
  }

  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return true;
}

/**
 * 移动文件夹到根目录的指定位置
 * @param {string} folderId - 要移动的文件夹ID
 * @param {string} targetFolderId - 参考位置的文件夹ID
 * @param {string} position - 插入位置：'before' 或 'after'
 * @returns {Promise<boolean>} 移动是否成功
 */
export async function moveFolderToRootPosition(folderId, targetFolderId, position = 'after') {
  const data = await readData();
  
  // 找到要移动的文件夹
  const folder = findFolderById(data.folders, folderId);
  if (!folder) return false;
  
  // 找到目标文件夹在根级别的位置
  const rootFolders = data.folders.filter(f => !f.parentId);
  const targetIndex = rootFolders.findIndex(f => f.id === targetFolderId);
  if (targetIndex < 0) return false;
  
  // 找到目标文件夹在data.folders中的实际位置
  const targetDataIndex = data.folders.findIndex(f => f.id === targetFolderId);
  if (targetDataIndex < 0) return false;

  // 从原位置移除
  function removeFromArray(folders) {
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].id === folderId) {
        folders.splice(i, 1);
        return true;
      }
      if (folders[i].children && removeFromArray(folders[i].children)) {
        return true;
      }
    }
    return false;
  }

  if (!removeFromArray(data.folders)) return false;

  // 更新父ID为null（移动到根级别）
  folder.parentId = null;

  // 计算插入位置
  let insertIndex = targetDataIndex;
  if (position === 'after') {
    insertIndex = targetDataIndex + 1;
  }
  
  // 插入到指定位置
  data.folders.splice(insertIndex, 0, folder);

  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return true;
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
 * @param {string} params.url - 书签URL
 * @param {string} [params.name] - 书签名称，如果未提供则从URL推测
 * @param {string} [params.iconUrl] - 图标URL
 * @param {Object} [params.mono] - 单色图标配置
 * @param {string} [params.remark] - 备注信息
 * @returns {Promise<Object|null>} 创建的书签对象，如果目标文件夹不存在则返回null
 */
export async function addBookmark({
  folderId,
  url,
  name,
  iconUrl,
  mono,
  remark
}) {
  const data = await readData();
  const folder = findFolderById(data.folders, folderId);
  if (!folder) return null; // 目标文件夹不存在

  const title = name || guessTitleFromUrl(url); // 如果没有提供名称，从URL推测
  const bookmark = {
    id: generateId('b'), // 生成书签ID，前缀为'b'
    url, // 书签URL
    name: title, // 书签名称
    iconType: iconUrl ? 'favicon' : 'mono', // 图标类型：favicon或mono
    iconUrl: iconUrl || '', // 图标URL
    mono: mono || null, // 单色图标配置
    remark: remark || '' // 备注信息
  };

  folder.bookmarks = folder.bookmarks || [];
  folder.bookmarks.push(bookmark);
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return bookmark;
}

/**
 * 删除书签
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} params.bookmarkId - 要删除的书签ID
 */
export async function deleteBookmark({
  folderId,
  bookmarkId
}) {
  const data = await readData();
  const folder = findFolderById(data.folders, folderId);
  if (!folder) return; // 目标文件夹不存在则返回

  const idx = (folder.bookmarks || []).findIndex(b => b.id === bookmarkId);
  if (idx >= 0) {
    folder.bookmarks.splice(idx, 1); // 从数组中移除书签
    data.lastModified = Date.now();
    await writeData(data);
    notifyChanged();
  }
}

/**
 * 更新书签为单色图标
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} params.bookmarkId - 书签ID
 * @param {string} [params.letter] - 图标字母，默认取书签名称首字母
 * @param {string} [params.color] - 图标颜色，默认根据字母生成
 */
export async function updateBookmarkMono({
  folderId,
  bookmarkId,
  letter,
  color
}) {
  const data = await readData();
  const folder = findFolderById(data.folders, folderId);
  const bm = folder?.bookmarks?.find(b => b.id === bookmarkId);
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
 * @param {string} params.bookmarkId - 书签ID
 * @param {string} [params.url] - 新的URL
 * @param {string} [params.name] - 新的名称
 * @param {string} [params.iconType] - 图标类型：'favicon' 或 'mono'
 * @param {string} [params.iconUrl] - 图标URL
 * @param {Object} [params.mono] - 单色图标配置
 */
export async function updateBookmark({
  folderId,
  bookmarkId,
  url,
  name,
  iconType,
  iconUrl,
  mono
}) {
  const data = await readData();
  const folder = findFolderById(data.folders, folderId);
  const bm = folder?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return; // 书签不存在则返回

  // 更新基本信息
  if (url !== undefined) bm.url = url;
  if (name !== undefined) bm.name = name;

  // 更新图标信息
  if (iconType === 'favicon') {
    bm.iconType = 'favicon';
    bm.iconUrl = iconUrl || buildFaviconUrl(bm.url);
    bm.mono = null;
  }
  if (iconType === 'mono') {
    bm.iconType = 'mono';
    bm.iconUrl = '';
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
 * @param {string} params.bookmarkId - 书签ID
 * @param {string} params.remark - 备注内容
 */
export async function updateBookmarkRemark({
  folderId,
  bookmarkId,
  remark
}) {
  const data = await readData();
  const folder = findFolderById(data.folders, folderId);
  const bm = folder?.bookmarks?.find(b => b.id === bookmarkId);
  if (!bm) return; // 书签不存在则返回

  bm.remark = remark || '';
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

/**
 * 移动书签到目标文件夹
 * @param {Object} params - 参数对象
 * @param {string} params.sourceFolderId - 源文件夹ID
 * @param {string} params.bookmarkId - 要移动的书签ID
 * @param {string} params.targetFolderId - 目标文件夹ID
 * @returns {Promise<boolean>} 移动是否成功
 */
export async function moveBookmark({
  sourceFolderId,
  bookmarkId,
  targetFolderId
}) {
  const data = await readData();
  debugger
  const sourceFolder = findFolderById(data.folders, sourceFolderId);
  const targetFolder = findFolderById(data.folders, targetFolderId);

  if (!sourceFolder || !targetFolder) return false; // 源或目标文件夹不存在

  const idx = (sourceFolder.bookmarks || []).findIndex(b => b.id === bookmarkId);
  if (idx < 0) return false; // 书签不存在

  // 从源文件夹移除书签
  const [bm] = sourceFolder.bookmarks.splice(idx, 1);

  // 添加到目标文件夹
  targetFolder.bookmarks = targetFolder.bookmarks || [];
  targetFolder.bookmarks.push(bm);

  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return true;
}

/**
 * 书签拖拽排序：将sourceId书签拖到targetId书签之前
 * @param {Object} params - 参数对象
 * @param {string} params.folderId - 文件夹ID
 * @param {string} params.sourceId - 要移动的书签ID
 * @param {string} params.targetId - 目标位置书签ID
 */
export async function reorderBookmarksRelative({
  folderId,
  sourceId,
  targetId
}) {
  const data = await readData();
  const folder = findFolderById(data.folders, folderId);
  if (!folder) return; // 文件夹不存在则返回

  const list = folder.bookmarks || [];
  const from = list.findIndex(b => b.id === sourceId);
  const to = list.findIndex(b => b.id === targetId);

  if (from < 0 || to < 0 || from === to) return; // 无效的移动操作

  // 执行数组元素移动
  const [item] = list.splice(from, 1); // 移除源位置的元素
  const insertIndex = from < to ? to - 1 : to; // 计算插入位置
  list.splice(insertIndex, 0, item); // 插入到新位置

  folder.bookmarks = list;
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
}

/**
 * 一级文件夹拖拽排序：将sourceId文件夹拖到targetId文件夹之前
 * @param {Object} params - 参数对象
 * @param {string} params.sourceId - 要移动的文件夹ID
 * @param {string} params.targetId - 目标位置文件夹ID
 */
export async function reorderFolders({
  sourceId,
  targetId
}) {
  const data = await readData();
  
  // 获取根级文件夹（不包含parentId的文件夹）
  const rootFolders = data.folders.filter(f => !f.parentId);
  const sourceIndex = rootFolders.findIndex(f => f.id === sourceId);
  const targetIndex = rootFolders.findIndex(f => f.id === targetId);
  
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false; // 无效的移动操作
  
  // 在data.folders中定位实际位置
  const sourceDataIndex = data.folders.findIndex(f => f.id === sourceId);
  const targetDataIndex = data.folders.findIndex(f => f.id === targetId);
  
  if (sourceDataIndex < 0 || targetDataIndex < 0) return false;
  
  // 执行数组元素移动
  const [folder] = data.folders.splice(sourceDataIndex, 1); // 移除源位置的元素
  const insertIndex = sourceDataIndex < targetDataIndex ? targetDataIndex - 1 : targetDataIndex; // 计算插入位置
  data.folders.splice(insertIndex, 0, folder); // 插入到新位置
  
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return true;
}

/**
 * 子文件夹拖拽排序：将sourceId子文件夹拖到targetId子文件夹之前
 * @param {Object} params - 参数对象
 * @param {string} params.parentId - 父文件夹ID
 * @param {string} params.sourceId - 要移动的子文件夹ID
 * @param {string} params.targetId - 目标位置子文件夹ID
 */
export async function reorderSubfolders({
  parentId,
  sourceId,
  targetId
}) {
  const data = await readData();
  const parentFolder = findFolderById(data.folders, parentId);
  if (!parentFolder || !parentFolder.children) return false; // 父文件夹不存在或没有子文件夹
  
  const children = parentFolder.children;
  const sourceIndex = children.findIndex(f => f.id === sourceId);
  const targetIndex = children.findIndex(f => f.id === targetId);
  
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false; // 无效的移动操作
  
  // 执行数组元素移动
  const [subfolder] = children.splice(sourceIndex, 1); // 移除源位置的元素
  const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex; // 计算插入位置
  children.splice(insertIndex, 0, subfolder); // 插入到新位置
  
  data.lastModified = Date.now();
  await writeData(data);
  notifyChanged();
  return true;
}

/**
 * ===========================================
 * 工具函数
 * ===========================================
 */

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
 * 判断数据是否为空
 * 用于避免空数据被错误备份
 * @param {Object} data - 要检查的数据对象
 * @returns {boolean} 如果数据为空则返回true
 */
export function isDataEmpty(data) {
  if (!data || typeof data !== 'object') return true;
  
  // 检查是否有文件夹
  if (!Array.isArray(data.folders) || data.folders.length === 0) {
    return true;
  }
  
  // 递归检查文件夹是否有内容
  function hasContentInFolder(folder) {
    // 检查文件夹是否有书签
    if (Array.isArray(folder.bookmarks) && folder.bookmarks.length > 0) {
      return true;
    }
    
    // 递归检查子文件夹
    if (Array.isArray(folder.children)) {
      return folder.children.some(child => hasContentInFolder(child));
    }
    
    return false;
  }
  
  const hasContent = data.folders.some(folder => hasContentInFolder(folder));
  return !hasContent;
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

/**
 * ===========================================
 * 兼容性函数（向后兼容旧的API）
 * ===========================================
 */

/**
 * 添加子文件夹 - 兼容旧API
 * @deprecated 使用 addFolder(name, parentId) 代替
 */
export async function addSubfolder(folderId, name) {
  return await addFolder(name, folderId);
}

/**
 * 重命名子文件夹 - 兼容旧API
 * @deprecated 使用 renameFolder(folderId, newName) 代替
 */
export async function renameSubfolder(folderId, subId, name) {
  return await renameFolder(subId, name);
}

/**
 * 删除子文件夹 - 兼容旧API
 * @deprecated 使用 deleteFolder(folderId) 代替
 */
export async function deleteSubfolder(folderId, subId) {
  return await deleteFolder(subId);
}

/**
 * 移动子文件夹 - 兼容旧API
 * @deprecated 使用 moveFolder(folderId, newParentId) 代替
 */
export async function moveSubfolder({
  sourceParentId,
  subId,
  targetParentId
}) {
  return await moveFolder(subId, targetParentId);
}

/**
 * 定位容器 - 兼容旧API
 * @deprecated 使用 findFolderById(folders, folderId) 代替
 */
export function locateContainer(data, folderId, subId) {
  if (subId) {
    return findFolderById(data.folders, subId);
  }
  return findFolderById(data.folders, folderId);
}
