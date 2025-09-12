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
 * 将毫秒时间戳转换为用户友好的格式 yyMMdd_HHmmss_sss
 * 
 * @param {number} timestamp - 毫秒时间戳
 * @returns {string} 格式化的时间字符串，例如：250819_014432_864
 */
export function formatTimestampToFriendlyFormat(timestamp) {
  const date = new Date(timestamp);
  
  const year = String(date.getFullYear()).slice(-2); // 取年份后两位
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const millisecond = String(date.getMilliseconds()).padStart(3, '0');
  
  return `${year}${month}${day}_${hour}${minute}${second}_${millisecond}`;
}

/**
 * 将用户友好格式 yyMMdd_HHmmss_sss 转换回毫秒时间戳
 * 
 * @param {string} timeStr - 格式化的时间字符串，例如：250819_014432_864
 * @returns {number|null} 毫秒时间戳，解析失败返回null
 */
export function parseFriendlyFormatToTimestamp(timeStr) {
  try {
    // 匹配格式 yyMMdd_HHmmss_sss
    const match = timeStr.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})$/);
    if (!match) return null;
    
    const [, yy, mm, dd, HH, MM, SS, sss] = match;
    
    // 处理年份：20xx 或 21xx
    const currentYear = new Date().getFullYear();
    const currentCentury = Math.floor(currentYear / 100) * 100;
    const year = currentCentury + parseInt(yy, 10);
    
    // 如果计算出的年份比当前年份大很多，可能是上个世纪
    const finalYear = year > currentYear + 10 ? year - 100 : year;
    
    const date = new Date(
      finalYear,
      parseInt(mm, 10) - 1, // 月份从0开始
      parseInt(dd, 10),
      parseInt(HH, 10),
      parseInt(MM, 10),
      parseInt(SS, 10),
      parseInt(sss, 10)
    );
    
    return date.getTime();
  } catch (e) {
    return null;
  }
}

/**
 * 从备份文件名中提取时间戳
 * 支持新的文件名格式，包含客户端标识符
 * 
 * 文件名格式：clientId_prefix_yyMMdd_HHmmss_sss.json
 * 通过下划线分割：[clientId, prefix, date, time, ms]
 * 
 * @param {string} fileName - 备份文件名
 * @returns {number|null} 提取的时间戳（毫秒），失败返回null
 */
export function extractTimestampFromFileName(fileName) {
  try {
    // 移除.json扩展名并按下划线分割
    const nameWithoutExt = fileName.slice(0, -5);
    const parts = nameWithoutExt.split('_');
    
    // 至少需要3个部分作为时间戳
    if (parts.length < 3) {
      return null;
    }
    
    // 提取时间戳部分（最后3个部分）
    const dateStr = parts[parts.length - 3]; // yyMMdd
    const timeStr = parts[parts.length - 2]; // HHmmss  
    const msStr = parts[parts.length - 1];   // sss
    
    const timeStampStr = `${dateStr}_${timeStr}_${msStr}`;
    return parseFriendlyFormatToTimestamp(timeStampStr);
  } catch (e) {
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
  else{
    return new Date('2020-01-01').getTime();
  }
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
    if (!settings?.webdav?.url) {
      console.log('WebDAV未配置，跳过云端检查');
      return null;
    }
    
    // 初始化WebDAV客户端
    const client = await createClient(settings.webdav);
    await client.ensureBase();
    
    // 获取云端文件列表
    const files = await client.list();
    
    // 筛选有效的数据备份文件：
    // 1. 必须是.json文件
    // 2. 排除同步前的安全备份文件（新格式：CLIENTID_sync_backup_xxx.json）
    const validFiles = files.filter(f => 
      f.name.endsWith('.json') && 
      !f.name.includes('_sync_backup_')
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
 
    // 设置同步后的数据属性
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
    
    // 获取客户端标识符，如果不存在则使用默认值
    const clientIdentifier = settings.client?.identifier || 'MYTAB';
    
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
    const formattedTime = formatTimestampToFriendlyFormat(dataTimestamp);
    const name = `${clientIdentifier}_${prefix}_${formattedTime}.json`;
    
    // 数据清理：避免缓存污染和减少文件大小
    // 深拷贝数据，防止修改原始数据
    const cleanData = JSON.parse(JSON.stringify(data || {}));
    if (cleanData && typeof cleanData === 'object') {
      delete cleanData.history; // 清除旧版本残留字段
      
      // 确保不将设置信息写入备份，保持数据纯粹性
      if (cleanData.settings) delete cleanData.settings;
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
