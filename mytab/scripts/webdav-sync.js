/**
 * WebDAV 同步共享模块
 * 提供 Chrome 扩展和 Web 版本共用的 WebDAV 同步功能
 * 
 * 设计原则：
 * - 通过参数传递环境特定的依赖（如存储API、WebDAV客户端）
 * - 保持纯函数设计，不依赖全局变量
 * - 统一的错误处理和日志记录
 */

/**
 * 从备份文件名中提取时间戳
 * 支持两种文件名格式，确保向后兼容性
 * 
 * 文件名格式：
 * 1. 新格式：prefix_1755515788864.json（直接使用13位时间戳数字）
 * 2. 旧格式：prefix_2025-08-18T11-11-46-555Z.json（ISO日期时间格式）
 * 
 * @param {string} fileName - 备份文件名
 * @returns {number|null} 提取的时间戳（毫秒），失败返回null
 */
export function extractTimestampFromFileName(fileName) {
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
      // 将文件名中的时间格式转换为标准ISO格式
      const isoString = timeStr.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
      const timestamp = new Date(isoString).getTime();
      return isNaN(timestamp) ? null : timestamp;
    }
    
    console.warn('无法识别的文件名格式:', fileName);
    return null;
  } catch (e) {
    console.warn('解析文件名时间戳失败:', fileName, e);
    return null;
  }
}

/**
 * 获取本地数据的时间戳
 * 用于与云端备份进行时间戳比较，判断数据新旧
 * 
 * 时间戳获取策略（按优先级）：
 * 1. 优先使用数据中的lastModified字段（如果存在）
 * 2. 其次使用文件夹和书签的最新创建/修改时间
 * 3. 最后使用一个较早的默认时间（2020-01-01），确保云端数据会被认为是更新的
 * 
 * @param {Object} localData - 本地存储的数据对象
 * @returns {number} 本地数据的最后修改时间戳（毫秒）
 */
export function getLocalDataTimestamp(localData) {
  // 策略1：使用数据中显式的最后修改时间
  if (localData?.lastModified) {
    return localData.lastModified;
  }
  
  // 策略2：递归遍历所有文件夹和书签，获取最新的时间戳
  let latestTime = 0;
  
  // 检查主文件夹列表
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
          // 检查子文件夹本身的时间戳
          if (subfolder.createdAt) latestTime = Math.max(latestTime, subfolder.createdAt);
          if (subfolder.updatedAt) latestTime = Math.max(latestTime, subfolder.updatedAt);
          
          // 检查子文件夹内的书签
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
  
  // 策略3：如果找不到任何时间戳，返回一个较早的默认时间
  // 这样可以确保云端数据会被认为是更新的，避免数据丢失
  return latestTime || new Date('2020-01-01').getTime();
}

/**
 * 清理数据中的图标数据URL
 * 用于减少备份文件大小，避免存储过大的base64图标数据
 * 
 * @param {Object} data - 需要清理的数据对象
 */
export function stripIconDataUrls(data) {
  if (!data || !Array.isArray(data.folders)) return;
  
  // 递归遍历所有文件夹和书签，删除图标数据
  data.folders.forEach(folder => {
    // 清理主文件夹中的书签图标
    if (Array.isArray(folder.bookmarks)) {
      folder.bookmarks.forEach(b => { 
        if (b && 'iconDataUrl' in b) delete b.iconDataUrl; 
      });
    }
    
    // 清理子文件夹中的书签图标
    if (Array.isArray(folder.subfolders)) {
      folder.subfolders.forEach(sub => {
        if (Array.isArray(sub.bookmarks)) {
          sub.bookmarks.forEach(b => { 
            if (b && 'iconDataUrl' in b) delete b.iconDataUrl; 
          });
        }
      });
    }
  });
}

/**
 * 检查云端是否有更新的数据
 * 核心功能：比较云端备份与本地数据的时间戳差异，判断是否需要同步
 * 
 * @param {Object} params - 参数对象
 * @param {Object} params.localData - 本地数据
 * @param {Object} params.settings - 设置信息
 * @param {Function} params.createClient - 创建WebDAV客户端的函数
 * @returns {Promise<Object|null>} 检查结果
 */
export async function checkCloudData({ localData, settings, createClient }) {
  try {
    // 验证WebDAV配置和自动备份是否启用
    if (!settings?.webdav?.url || !settings?.backup?.enabled) {
      console.log('WebDAV未配置或自动备份未启用，跳过云端检查');
      return null;
    }
    
    // 初始化WebDAV客户端
    const client = await createClient(settings.webdav);
    await client.ensureBase();
    
    // 获取云端文件列表
    const files = await client.list();
    
    // 筛选有效的数据备份文件：
    // 1. 必须是.json文件
    // 2. 排除sync_backup_前缀的文件（这些是同步前的安全备份）
    const validFiles = files.filter(f => 
      f.name.endsWith('.json') && 
      !f.name.startsWith('sync_backup_')
    );
    
    if (validFiles.length === 0) {
      console.log('云端无有效数据备份文件');
      return null;
    }
    
    // 按修改时间降序排序，获取最新的云端备份文件
    const latestCloudFile = validFiles.sort((a, b) => b.lastmod - a.lastmod)[0];
    
    // 获取本地数据的最后修改时间戳
    const localTimestamp = getLocalDataTimestamp(localData);
    
    // 从文件名中提取时间戳（最可靠的方法，避免服务器时间差异）
    const cloudTimestamp = extractTimestampFromFileName(latestCloudFile.name);
    
    // 时间戳提取失败处理
    if (!cloudTimestamp) {
      console.warn('无法从文件名提取时间戳:', latestCloudFile.name);
      return { hasNewerData: false, error: '无法解析文件名时间戳' };
    }
    
    // 计算时间戳差异，判断是否需要同步
    const timeDiff = cloudTimestamp - localTimestamp;
    const threshold = 2000; // 2秒阈值，文件名时间戳很准确
    
    // 详细的调试信息，包含可读的时间字符串
    console.log('云端数据检查完成:', {
      云端文件名: latestCloudFile.name,
      云端时间戳: cloudTimestamp,
      本地时间戳: localTimestamp,
      时间差异: timeDiff,
      阈值: threshold,
      云端时间: new Date(cloudTimestamp).toLocaleString('zh-CN'),
      本地时间: new Date(localTimestamp).toLocaleString('zh-CN'),
      需要同步: timeDiff > threshold
    });
    
    // 如果云端数据比本地新，返回同步提示信息
    if (timeDiff > threshold) {
      console.log('检测到云端新数据，建议同步');
      return {
        hasNewerData: true,
        cloudFile: latestCloudFile,
        cloudTime: new Date(cloudTimestamp).toLocaleString(),
        localTime: new Date(localTimestamp).toLocaleString(),
        timeDifference: Math.round(timeDiff / 1000) + '秒'
      };
    }
    
    console.log('本地数据已是最新，无需同步');
    return { hasNewerData: false };
  } catch (e) {
    console.warn('检查云端数据失败:', e);
    return null;
  }
}

/**
 * 从云端同步数据到本地
 * 完整的云端数据同步流程，包含数据安全保护机制
 * 
 * @param {Object} params - 参数对象
 * @param {string} params.fileName - 要同步的云端备份文件名
 * @param {Object} params.settings - 设置信息
 * @param {Function} params.createClient - 创建WebDAV客户端的函数
 * @param {Function} params.doBackup - 执行备份的函数
 * @param {Function} params.saveData - 保存数据的函数
 * @param {Function} params.notifyDataChanged - 通知数据变化的函数
 * @returns {Promise<Object>} 同步结果
 */
export async function syncFromCloudData({ 
  fileName, 
  settings, 
  createClient, 
  doBackup, 
  saveData,
  notifyDataChanged 
}) {
  try {
    // 验证WebDAV配置
    if (!settings?.webdav?.url) {
      throw new Error('WebDAV未配置');
    }
    
    // 初始化WebDAV客户端
    const client = await createClient(settings.webdav);
    
    // 步骤1：同步前备份当前本地数据（防止数据丢失）
    await doBackup('sync_backup');
    console.log('已创建本地数据备份，准备同步');
    
    // 步骤2：下载指定的云端备份文件
    const cloudData = await client.downloadJSON(fileName);
    const restored = cloudData?.data || {};
    
    // 步骤3：设置正确的数据时间戳和同步元信息
    // 优先使用文件名中的时间戳（最准确）
    const fileTimestamp = extractTimestampFromFileName(fileName);
    const originalTimestamp = fileTimestamp || cloudData?.ts || restored.lastModified || Date.now();
    
    // 设置同步后的数据属性
    restored.lastModified = originalTimestamp;
    restored.syncedFrom = fileName;  // 记录同步来源文件名
    restored.syncedAt = new Date().toISOString();  // 记录同步时间
    
    // 步骤4：保存数据到本地存储
    await saveData(restored);
    console.log('云端数据已成功同步到本地');
    
    // 步骤5：通知前端数据已更新（触发界面刷新）
    if (notifyDataChanged) {
      try {
        await notifyDataChanged();
      } catch (e) {
        // 忽略通知失败的错误
      }
    }
    
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

/**
 * 执行云端备份的通用函数
 * 将本地数据备份到WebDAV服务器
 * 
 * @param {Object} params - 参数对象
 * @param {Object} params.data - 要备份的数据
 * @param {Object} params.settings - 设置信息
 * @param {string} params.source - 备份来源类型
 * @param {Function} params.createClient - 创建WebDAV客户端的函数
 * @param {Function} [params.isDataEmpty] - 检查数据是否为空的函数
 * @returns {Promise<void>}
 */
export async function doBackupToCloud({ data, settings, source, createClient, isDataEmpty }) {
  try {
    // 检查WebDAV配置
    if (!settings?.webdav?.url) return;
    
    // 检查数据是否为空，避免空数据覆盖云端数据
    // sync_backup 类型的备份不进行此检查，因为同步前需要备份当前状态
    if (source !== 'sync_backup' && isDataEmpty && isDataEmpty(data)) {
      console.log('检测到空数据，跳过自动备份以避免覆盖云端数据');
      return;
    }
    
    // 创建WebDAV客户端
    const client = await createClient(settings.webdav);
    
    // 根据备份来源设置文件名前缀
    const prefixMap = { 
      alarm: 'snapshot_schedule',      // 定时备份
      manual: 'snapshot_user',         // 手动备份
      auto: 'snapshot_handle',         // 操作触发备份
      sync_backup: 'sync_backup'       // 同步前安全备份
    };
    const prefix = prefixMap[source] || 'snapshot_user';
    
    // 使用数据最后修改时间作为文件名时间戳，确保准确性
    const dataTimestamp = data?.lastModified || Date.now();
    const name = `${prefix}_${dataTimestamp}.json`;
    
    // 数据清理：避免缓存污染和减少文件大小
    // 深拷贝数据，防止修改原始数据
    const cleanData = JSON.parse(JSON.stringify(data || {}));
    if (cleanData && typeof cleanData === 'object') {
      delete cleanData.history; // 清除旧版本残留字段
      
      // 确保不将设置信息写入备份，保持数据纯粹性
      if (cleanData.settings) delete cleanData.settings;
      
      // 移除图标数据URL，避免备份文件过大
      try { 
        stripIconDataUrls(cleanData); 
      } catch (e) {
        // 忽略清理失败
      }
    }
    
    // 构建标准格式的备份数据
    const payload = { 
      version: 1, 
      ts: dataTimestamp, 
      data: cleanData 
    };
    
    // 确保WebDAV基础目录存在
    await client.ensureBase();
    
    // 上传备份文件
    await client.uploadJSON(name, payload);
    
    // 清理旧备份：按时间排序，保留最新的N个文件
    const files = await client.list();
    const max = Math.max(1, settings.backup?.maxSnapshots ?? 100);
    if (files.length > max) {
      // 按修改时间排序，删除最旧的文件
      const toDelete = files
        .sort((a, b) => a.lastmod - b.lastmod)
        .slice(0, files.length - max);
      for (const f of toDelete) {
        await client.remove(f.name);
      }
    }
    
    console.log(`备份完成: ${name} (${source})`);
  } catch (e) {
    console.error('备份失败:', e);
    throw e;
  }
}
