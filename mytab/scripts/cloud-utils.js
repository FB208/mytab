/**
 * 云端备份检查工具 - 供Chrome扩展和Web环境复用
 * 提取自service_worker.js的云端检查逻辑
 */

import { WebDAVClient } from './webdav.js';

/**
 * 检查云端是否有更新的备份数据
 * 这是service_worker.js中checkCloudDataOnStartup的通用版本
 * 
 * @param {Object} settings - 用户设置对象
 * @param {Object} localData - 本地数据对象
 * @returns {Promise<Object>} 检查结果
 */
export async function checkCloudData(settings, localData) {
  try {
    // 检查WebDAV配置和备份设置
    if (!settings?.webdav?.url || !settings?.backup?.enabled) {
      console.log('WebDAV未配置或自动备份未启用');
      return { hasNewerData: false, reason: '未配置或禁用' };
    }
    
    // 初始化WebDAV客户端
    const client = new WebDAVClient(settings.webdav);
    await client.ensureBase();
    
    // 获取云端文件列表
    const files = await client.list();
    
    // 筛选有效的数据备份文件
    const validFiles = files.filter(f => 
      f.name.endsWith('.json') && 
      !f.name.startsWith('sync_backup_')
    );
    
    if (validFiles.length === 0) {
      return { hasNewerData: false, reason: '无有效备份文件' };
    }
    
    // 获取最新的云端备份文件
    const latestCloudFile = validFiles.sort((a, b) => b.lastmod - a.lastmod)[0];
    
    // 获取时间戳进行比较
    const localTimestamp = getLocalDataTimestamp(localData);
    const cloudTimestamp = extractTimestampFromFileName(latestCloudFile.name);
    
    if (!cloudTimestamp) {
      return { hasNewerData: false, error: '无法解析文件名时间戳' };
    }
    
    // 比较时间戳
    const timeDiff = cloudTimestamp - localTimestamp;
    const threshold = 2000; // 2秒容错
    
    const hasNewerData = timeDiff > threshold;
    
    return {
      hasNewerData,
      cloudFile: latestCloudFile,
      cloudTime: new Date(cloudTimestamp).toLocaleString('zh-CN'),
      localTime: new Date(localTimestamp).toLocaleString('zh-CN'),
      timeDifference: Math.round(timeDiff / 1000) + '秒'
    };
    
  } catch (e) {
    console.warn('检查云端数据失败:', e);
    return { hasNewerData: false, error: e.message };
  }
}

/**
 * 从备份文件名中提取时间戳
 * 支持新旧两种文件名格式
 */
function extractTimestampFromFileName(fileName) {
  try {
    // 新格式：prefix_1755515788864.json
    const newFormatMatch = fileName.match(/(\d{13})\.json$/);
    if (newFormatMatch) {
      const timestamp = parseInt(newFormatMatch[1], 10);
      return isNaN(timestamp) ? null : timestamp;
    }
    
    // 旧格式：prefix_2025-08-18T11-11-46-555Z.json
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

/**
 * 获取本地数据的时间戳
 * 用于与云端备份进行时间戳比较
 */
function getLocalDataTimestamp(localData) {
  // 优先使用数据中显式的最后修改时间
  if (localData?.lastModified) {
    return localData.lastModified;
  }
  
  // 递归遍历所有文件夹和书签，获取最新的时间戳
  let latestTime = 0;
  
  if (localData?.folders) {
    localData.folders.forEach(folder => {
      // 检查文件夹本身的时间戳
      if (folder.createdAt) latestTime = Math.max(latestTime, folder.createdAt);
      if (folder.updatedAt) latestTime = Math.max(latestTime, folder.updatedAt);
      
      // 检查文件夹内的书签
      if (folder.bookmarks) {
        folder.bookmarks.forEach(bookmark => {
          if (bookmark.createdAt) latestTime = Math.max(latestTime, bookmark.createdAt);
          if (bookmark.updatedAt) latestTime = Math.max(latestTime, bookmark.updatedAt);
        });
      }
      
      // 递归检查子文件夹
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
  
  // 如果找不到任何时间戳，返回一个较早的默认时间
  return latestTime || new Date('2020-01-01').getTime();
}

/**
 * 从云端同步数据到本地
 * 通用的云端数据同步功能
 */
export async function syncFromCloud(settings, fileName) {
  try {
    // 验证WebDAV配置
    if (!settings?.webdav?.url) {
      throw new Error('WebDAV未配置');
    }

    // 初始化WebDAV客户端
    const client = new WebDAVClient(settings.webdav);
    await client.ensureBase();
    
    // 下载指定的云端备份文件
    const cloudData = await client.downloadJSON(fileName);
    const restored = cloudData?.data || {};
    
    // 设置正确的数据时间戳和同步元信息
    const fileTimestamp = extractTimestampFromFileName(fileName);
    const originalTimestamp = fileTimestamp || cloudData?.ts || restored.lastModified || Date.now();
    
    restored.lastModified = originalTimestamp;
    restored.syncedFrom = fileName;
    restored.syncedAt = new Date().toISOString();
    
    return { success: true, data: restored };
  } catch (e) {
    console.error('从云端同步数据失败:', e);
    return { success: false, error: e.message };
  }
}