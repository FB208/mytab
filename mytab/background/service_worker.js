/**
 * MyTab Chrome扩展 - 后台服务工作线程 (service_worker.js)
 * 
 * 核心功能：
 * 1. 自动云端备份：定时将本地书签数据备份到WebDAV服务器
 * 2. 云端数据同步：检测云端更新并提示用户同步
 * 3. 图标收集：后台获取网站favicon图标
 * 4. 消息路由：处理来自popup和options页面的请求
 */

import { DEFAULT_SETTINGS, readAll, writeSettings, isDataEmpty } from '../scripts/storage.js';
import { WebDAVClient } from '../scripts/webdav.js';
import { collectFavicons } from '../scripts/favicon-utils.js';
import { 
  checkCloudData, 
  syncFromCloudData, 
  doBackupToCloud,
  stripIconDataUrls,
  extractTimestampFromFileName,
  getLocalDataTimestamp 
} from '../scripts/webdav-sync.js';

/**
 * 扩展安装/更新时的初始化处理
 * 确保默认设置存在并启动定时备份
 */
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await readAll();
  if (!settings || !('backup' in settings)) {
    await writeSettings(DEFAULT_SETTINGS);
  }
  await ensureAlarm(); // 设置定时备份闹钟
});

/**
 * 本地存储变化监听
 * 当设置或数据发生变化时的处理逻辑
 */
chrome.storage.onChanged.addListener(async (changes, area) => {
  // 设置变化：重新配置定时备份
  if (area === 'local' && changes.settings) {
    await ensureAlarm();
  }
  
  // 数据变化：检查是否为空数据，非空数据才触发防抖备份
  if (area === 'local' && changes.data) {
    const newData = changes.data.newValue;
    // 检查数据是否为空，空数据不触发自动备份
    if (!isDataEmpty(newData)) {
      // 标记为 auto来源，表示由用户操作触发
      scheduleBackup('auto');
    } else {
      console.log('检测到空数据变化，跳过自动备份');
    }
  }
});

/**
 * 定时闹钟触发处理
 * 执行定时备份任务
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'mytab:auto-backup') {
    await doBackup('alarm');
  }
});

/**
 * 确保定时备份闹钟设置正确
 * 根据用户设置调整备份频率，支持最小15分钟间隔
 */
async function ensureAlarm() {
  const { settings } = await readAll();
  // 确保最小备份间隔为15分钟，防止过于频繁的备份
  const hours = Math.max(0.25, settings?.backup?.frequencyHours ?? 4);
  const periodMinutes = hours * 60;
  
  // 清除现有闹钟并重新创建
  await chrome.alarms.clear('mytab:auto-backup');
  if (settings?.backup?.enabled) {
    // 延迟1分钟后首次执行，然后按设定周期执行
    await chrome.alarms.create('mytab:auto-backup', { 
      delayInMinutes: 1, 
      periodInMinutes: periodMinutes 
    });
  }
}

/**
 * 通用防抖调度器
 * 统一管理所有需要防抖的操作
 */
class DebounceScheduler {
  constructor() {
    this.timers = new Map(); // 存储不同操作的定时器
  }

  /**
   * 调度防抖任务
   * @param {string} key - 任务标识符
   * @param {Function} fn - 要执行的函数
   * @param {number} delay - 防抖延迟时间（毫秒）
   */
  schedule(key, fn, delay) {
    // 清除之前的定时器
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    
    // 设置新的定时器
    const timer = setTimeout(() => {
      this.timers.delete(key);
      fn();
    }, delay);
    
    this.timers.set(key, timer);
  }

  /**
   * 取消指定的防抖任务
   * @param {string} key - 任务标识符
   */
  cancel(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }
}

// 创建全局防抖调度器实例
const debouncer = new DebounceScheduler();

/**
 * 调度备份任务（带防抖功能）
 * @param {string} source - 备份来源：'auto'|'manual'|'alarm'|'sync_backup'
 */
function scheduleBackup(source = 'auto') {
  // 使用统一的防抖调度器，4秒防抖
  debouncer.schedule('backup', () => doBackup(source), 4000);
}

/**
 * 执行云端备份的核心函数
 * 将本地书签数据备份到WebDAV服务器
 * 
 * @param {string} source - 备份来源，影响文件名前缀和通知行为
 *  - alarm: 定时备份，文件前缀 snapshot_schedule
 *  - manual: 手动备份，文件前缀 snapshot_user
 *  - auto: 操作触发的自动备份，文件前缀 snapshot_handle
 *  - sync_backup: 同步前的安全备份，文件前缀 sync_backup
 */
async function doBackup(source = 'manual') {
  try {
    // 获取最新的本地数据和设置
    const { data, settings } = await readAll();
    
    // 使用共享模块的备份函数，传入空数据检测函数
    await doBackupToCloud({
      data,
      settings,
      source,
      createClient: (config) => new WebDAVClient(config),
      isDataEmpty
    });
    
    // 同步备份不显示通知，避免干扰用户
    if (source !== 'sync_backup') {
      const prefixMap = { 
        alarm: '定时', 
        manual: '手动',
        auto: '自动'
      };
      const backupType = prefixMap[source] || '手动';
      chrome.notifications.create({
        type: 'basic', 
        iconUrl: 'icon128.png', 
        title: 'MyTab 备份成功', 
        message: `${backupType}备份完成`
      }, () => {});
    }
  } catch (e) {
    console.warn('备份失败', e);
    // 同步备份失败也不显示通知，避免干扰
    if (source !== 'sync_backup') {
      chrome.notifications.create({
        type: 'basic', 
        iconUrl: 'icon128.png', 
        title: 'MyTab 备份失败', 
        message: String(e?.message || e)
      }, () => {});
    }
  }
}

/**
 * 消息路由系统 - 处理来自扩展各部分的通信请求
 * 支持异步操作，使用Promise确保响应正确返回
 * 
 * 支持的请求类型：
 * - favicon:fetch - 获取网站图标
 * - title:fetch - 获取网站标题
 * - backup:manual - 手动触发备份
 * - backup:list - 获取备份文件列表
 * - backup:restore - 恢复指定备份
 * - webdav:test - 测试WebDAV连接
 * - cloud:check - 检查云端更新
 * - cloud:sync - 从云端同步数据
 * - cloud:manual-check - 手动检查云端更新
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 使用异步IIFE确保可以返回Promise
  (async () => {
    try {
      // 获取网站favicon图标
      if (msg?.type === 'favicon:fetch') {
        const { pageUrl } = msg;
        const out = await collectFaviconsInBg(pageUrl);
        sendResponse({ ok: true, icons: out });
        return;
      }
      
      // 获取网站标题
      if (msg?.type === 'title:fetch') {
        const { url } = msg;
        const title = await fetchTitle(url);
        sendResponse({ title });
        return;
      }

      // 手动触发备份
      if (msg?.type === 'backup:manual') {
        const src = msg?.source || 'manual';
        await doBackup(src);
        sendResponse({ ok: true });
        return;
      }
      
      // 获取WebDAV备份文件列表
      if (msg?.type === 'backup:list') {
        const { settings } = await readAll();
        const client = new WebDAVClient(settings.webdav);
        await client.ensureBase();
        const list = await client.list();
        sendResponse({ ok: true, list });
        return;
      }
      
      // 从备份恢复数据
      if (msg?.type === 'backup:restore') {
        const { name } = msg;
        const { settings } = await readAll();
        const client = new WebDAVClient(settings.webdav);
        const json = await client.downloadJSON(name);
        
        // 安全恢复：仅使用data字段，避免覆盖设置
        const restored = json?.data || {};
        await chrome.storage.local.set({ data: restored });
        sendResponse({ ok: true });
        
        // 通知前端数据已更新，触发界面刷新
        chrome.runtime.sendMessage({ type: 'data:changed' }).catch(() => {});
        return;
      }
      
      // 测试WebDAV连接配置
      if (msg?.type === 'webdav:test') {
        const { config } = msg;
        const client = new WebDAVClient(config);
        const result = await client.testAuthentication();
        if (result.success) {
          sendResponse({ ok: true, canWrite: result.canWrite });
        } else {
          sendResponse({ ok: false, error: result.error });
        }
        return;
      }
      
      // 检查云端是否有更新数据（仅在用户主动请求时执行）
      if (msg?.type === 'cloud:check') {
        const result = await checkCloudDataOnStartup();
        sendResponse({ ok: true, result });
        return;
      }
      
      // 从云端同步指定文件
      if (msg?.type === 'cloud:sync') {
        const { fileName } = msg;
        const result = await syncFromCloud(fileName);
        sendResponse({ ok: true, result });
        return;
      }
      
      // 手动检查云端更新
      if (msg?.type === 'cloud:manual-check') {
        const result = await checkCloudDataOnStartup();
        sendResponse({ ok: true, result });
        return;
      }
    } catch (e) {
      // 统一错误处理
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  
  // 返回true表示将异步响应
  return true;
});

// stripIconDataUrls 函数已移至 webdav-sync.js 共享模块

/**
 * 后台收集网站favicon图标的完整流程
 * 使用统一的图标获取逻辑，支持图标验证
 * 
 * @param {string} pageUrl - 目标网站的完整URL
 * @returns {Promise<string[]>} - 返回图标URL数组，按优先级排序
 */
async function collectFaviconsInBg(pageUrl) {
  // 图标验证函数：检查图标是否有效
  const validateIcon = async (href) => {
    try {
      const res = await fetch(href, { method: 'HEAD' });
      const contentType = res.headers.get('content-type') || '';
      
      // 验证响应状态和Content-Type
      if (res.ok && /image\//.test(contentType)) {
        return href;
      }
    } catch (e) {
      // 请求失败，忽略此图标
    }
    return null;
  };

  // 使用统一的图标收集逻辑，并提供验证函数
  return await collectFavicons(pageUrl, fetch, validateIcon);
}

/**
 * 获取网站标题的后台实现
 * 通过HTTP请求获取页面<title>标签内容
 * 
 * @param {string} url - 目标网站URL
 * @returns {Promise<string>} - 返回网站标题，失败时返回空字符串
 */
async function fetchTitle(url) {
  try {
    const response = await fetch(url);
    
    // 确保响应成功
    if (!response.ok) {
      return '';
    }
    
    const html = await response.text();
    
    // 使用正则表达式提取<title>标签内容
    // 支持各种大小写和空格变体
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    
    if (titleMatch && titleMatch[1]) {
      // 清理标题内容：去除前后空格和特殊字符
      return titleMatch[1].trim();
    }
    
    return '';
  } catch (e) {
    // 网络错误、跨域问题等情况下返回空
    console.warn('获取网站标题失败:', url, e);
    return '';
  }
}

/**
 * 启动时检查云端是否有更新的数据
 * 使用共享模块的通用检查逻辑
 * 
 * @returns {Promise<Object|null>} 检查结果，包含是否需要同步的信息
 */
async function checkCloudDataOnStartup() {
  const { data: localData, settings } = await readAll();
  return checkCloudData({
    localData,
    settings,
    createClient: (config) => new WebDAVClient(config)
  });
}

// extractTimestampFromFileName 和 getLocalDataTimestamp 函数已移至 webdav-sync.js 共享模块

/**
 * 从云端同步数据到本地
 * 使用共享模块的通用同步逻辑
 * 
 * @param {string} fileName - 要同步的云端备份文件名
 * @returns {Promise<Object>} 同步结果 {success, fileName, syncedAt}
 */
async function syncFromCloud(fileName) {
  const { settings } = await readAll();
  return syncFromCloudData({
    fileName,
    settings,
    createClient: (config) => new WebDAVClient(config),
    doBackup,
    saveData: (data) => chrome.storage.local.set({ data }),
    notifyDataChanged: () => chrome.runtime.sendMessage({ type: 'data:changed' }).catch(() => {})
  });
}


