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
      
      // 批量增强书签信息
      if (msg?.type === 'bookmark:enhance-batch') {
        const { urls } = msg;
        const results = await enhanceBatchBookmarks(urls);
        sendResponse({ ok: true, results });
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
 * 使用统一的图标获取逻辑，支持图标验证和完整错误处理
 * 
 * @param {string} pageUrl - 目标网站的完整URL
 * @returns {Promise<string[]>} - 返回图标URL数组，按优先级排序
 */
async function collectFaviconsInBg(pageUrl) {
  const TIMEOUT_MS = 8000; // 8秒超时
  
  // 增强的图标验证函数：检查图标是否有效，包含完整错误处理
  const validateIcon = async (href) => {
    try {
      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, TIMEOUT_MS);

      const res = await fetch(href, { 
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      clearTimeout(timeoutId);
      
      // HTTP错误处理
      if (!res.ok) {
        const errorType = res.status >= 500 ? '服务器错误' : 
                         res.status >= 400 ? '客户端错误' : '未知错误';
        console.warn(`图标验证失败 - ${errorType} (${res.status}):`, href);
        return null;
      }
      
      const contentType = res.headers.get('content-type') || '';
      
      // 验证Content-Type是否为图片类型
      if (/image\//.test(contentType)) {
        // 检查图片大小，避免过大的图片
        const contentLength = res.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB限制
          console.warn('图标文件过大，跳过:', href, `${Math.round(parseInt(contentLength) / 1024)}KB`);
          return null;
        }
        
        return href;
      } else {
        console.warn('图标Content-Type验证失败:', href, contentType);
        return null;
      }
      
    } catch (e) {
      // 详细的错误分类和日志记录
      let errorType = '未知错误';
      let errorMessage = e.message || String(e);
      
      if (e.name === 'AbortError') {
        errorType = '请求超时';
        errorMessage = `图标验证超时 (${TIMEOUT_MS}ms)`;
      } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        errorType = '网络错误';
        errorMessage = '无法连接到图标服务器';
      } else if (e.message.includes('CORS')) {
        errorType = 'CORS错误';
        errorMessage = '图标跨域请求被阻止';
      }
      
      console.warn(`图标验证失败 - ${errorType}:`, href, errorMessage);
      return null;
    }
  };

  try {
    // 使用统一的图标收集逻辑，并提供增强的验证函数
    const icons = await collectFavicons(pageUrl, fetch, validateIcon);
    
    // 如果没有找到有效图标，记录详细信息
    if (!icons || icons.length === 0) {
      console.info('未找到有效的favicon图标:', pageUrl);
    } else {
      console.info(`成功收集到 ${icons.length} 个图标:`, pageUrl);
    }
    
    return icons || [];
    
  } catch (e) {
    // 图标收集过程的整体错误处理
    console.warn('图标收集过程失败:', pageUrl, e.message || String(e));
    return [];
  }
}

/**
 * 获取网站标题的后台实现
 * 通过HTTP请求获取页面<title>标签内容，包含完整的错误处理
 * 
 * @param {string} url - 目标网站URL
 * @returns {Promise<string>} - 返回网站标题，失败时返回空字符串
 */
async function fetchTitle(url) {
  const TIMEOUT_MS = 8000; // 8秒超时
  
  console.log(`🔍 [标题获取] 开始获取标题:`, url);
  
  try {
    // 创建超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    console.log(`📡 [标题获取] 发送HTTP请求:`, url);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);
    
    console.log(`📊 [标题获取] HTTP响应状态:`, response.status, response.statusText, url);
    
    // HTTP错误处理（4xx/5xx状态码）
    if (!response.ok) {
      const errorType = response.status >= 500 ? '服务器错误' : 
                       response.status >= 400 ? '客户端错误' : '未知错误';
      const errorMsg = `获取网站标题失败 - ${errorType} (${response.status})`;
      console.warn(`❌ [标题获取] ${errorMsg}:`, url);
      return null;
    }
    
    // 检查Content-Type，确保是HTML内容
    const contentType = response.headers.get('content-type') || '';
    console.log(`📄 [标题获取] Content-Type:`, contentType, url);
    
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      const errorMsg = '获取网站标题失败 - 非HTML内容';
      console.warn(`❌ [标题获取] ${errorMsg}:`, url, contentType);
      return null;
    }
    
    console.log(`📖 [标题获取] 开始解析HTML内容:`, url);
    const html = await response.text();
    const htmlLength = html.length;
    console.log(`📖 [标题获取] HTML内容长度: ${htmlLength} 字符:`, url);
    
    // HTML解析错误处理
    try {
      // 使用正则表达式提取<title>标签内容
      // 支持各种大小写和空格变体，以及多行标题
      const titleMatch = html.match(/<title[^>]*>\s*([^<]*?)\s*<\/title>/is);
      
      console.log(`🔍 [标题获取] title标签匹配结果:`, titleMatch ? `找到: "${titleMatch[1]}"` : '未找到', url);
      
      if (titleMatch && titleMatch[1]) {
        // 清理标题内容：去除前后空格、换行符和多余的空白字符
        const rawTitle = titleMatch[1];
        const cleanTitle = rawTitle
          .replace(/\s+/g, ' ')  // 将多个空白字符替换为单个空格
          .trim();
        
        console.log(`🧹 [标题获取] 标题清理: "${rawTitle}" -> "${cleanTitle}":`, url);
        
        if (cleanTitle.length > 0) {
          console.log(`✅ [标题获取] 成功获取标题: "${cleanTitle}":`, url);
          return cleanTitle;
        } else {
          console.warn(`⚠️ [标题获取] 标题为空字符串:`, url);
          return null;
        }
      }
      
      // 如果没有找到title标签，尝试查找其他可能的标题元素
      console.log(`🔍 [标题获取] 尝试查找H1标签:`, url);
      const h1Match = html.match(/<h1[^>]*>\s*([^<]*?)\s*<\/h1>/is);
      
      console.log(`🔍 [标题获取] H1标签匹配结果:`, h1Match ? `找到: "${h1Match[1]}"` : '未找到', url);
      
      if (h1Match && h1Match[1]) {
        const h1Title = h1Match[1].replace(/\s+/g, ' ').trim();
        if (h1Title.length > 0) {
          console.log(`✅ [标题获取] 使用H1标签作为标题: "${h1Title}":`, url);
          return h1Title;
        }
      }
      
      console.warn(`❌ [标题获取] 未找到有效的标题内容:`, url);
      return null;
    } catch (parseError) {
      const errorMsg = `HTML解析错误: ${parseError.message}`;
      console.warn(`❌ [标题获取] ${errorMsg}:`, url, parseError);
      return null;
    }
    
  } catch (e) {
    // 详细的错误分类和日志记录
    let errorType = '未知错误';
    let errorMessage = e.message || String(e);
    
    if (e.name === 'AbortError') {
      errorType = '请求超时';
      errorMessage = `请求超时 (${TIMEOUT_MS}ms)`;
    } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      errorType = '网络错误';
      errorMessage = '无法连接到服务器';
    } else if (e.message.includes('CORS')) {
      errorType = 'CORS错误';
      errorMessage = '跨域请求被阻止';
    } else if (e.message.includes('SSL') || e.message.includes('certificate')) {
      errorType = 'SSL错误';
      errorMessage = 'SSL证书验证失败';
    }
    
    console.warn(`❌ [标题获取] ${errorType}: ${errorMessage}:`, url, e);
    return null;
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

/**
 * 批量增强书签信息
 * 集成现有的fetchTitle和collectFavicons功能，为多个URL获取增强信息
 * 包含完整的错误处理和超时控制
 * 
 * @param {string[]} urls - 需要增强的URL数组
 * @returns {Promise<Object[]>} 增强结果数组，每个元素包含url、title、icons等信息
 */
async function enhanceBatchBookmarks(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return [];
  }

  const results = [];
  const BATCH_TIMEOUT = 30000; // 整个批次30秒超时
  const startTime = Date.now();
  
  console.info(`开始批量增强 ${urls.length} 个书签`);
  
  // 为每个URL获取增强信息
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    
    // 检查整体超时
    if (Date.now() - startTime > BATCH_TIMEOUT) {
      console.warn('批量增强超时，停止处理剩余URL');
      break;
    }
    
    try {
      const result = {
        url,
        success: false,
        title: '',
        icons: [],
        error: null,
        errorType: null
      };

      console.log(`🚀 [批量增强] 开始处理书签 [${i + 1}/${urls.length}]:`, url);

      // 并行获取标题和图标信息，设置合理的超时时间
      const [titleResult, iconsResult] = await Promise.allSettled([
        Promise.race([
          fetchTitle(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('标题获取超时')), 8000))
        ]),
        Promise.race([
          collectFaviconsInBg(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('图标获取超时')), 8000))
        ])
      ]);

      console.log(`📊 [批量增强] 获取结果 [${i + 1}/${urls.length}]:`, {
        url,
        titleStatus: titleResult.status,
        titleValue: titleResult.status === 'fulfilled' ? titleResult.value : null,
        titleError: titleResult.status === 'rejected' ? titleResult.reason?.message : null,
        iconsStatus: iconsResult.status,
        iconsCount: iconsResult.status === 'fulfilled' ? iconsResult.value?.length : 0
      });

      // 处理标题获取结果
      if (titleResult.status === 'fulfilled' && titleResult.value) {
        result.title = titleResult.value;
        console.log(`✅ [批量增强] 标题获取成功 [${i + 1}/${urls.length}]: "${result.title}":`, url);
      } else if (titleResult.status === 'rejected') {
        const error = titleResult.reason;
        result.titleError = error.message || String(error);
        console.warn(`❌ [批量增强] 标题获取失败 [${i + 1}/${urls.length}]: ${result.titleError}:`, url, error);
      } else {
        console.warn(`⚠️ [批量增强] 标题获取返回空值 [${i + 1}/${urls.length}]:`, url);
        result.titleError = '标题获取返回空值';
      }

      // 处理图标获取结果
      if (iconsResult.status === 'fulfilled' && Array.isArray(iconsResult.value)) {
        result.icons = iconsResult.value;
      } else if (iconsResult.status === 'rejected') {
        const error = iconsResult.reason;
        result.iconError = error.message || String(error);
        console.warn(`图标获取失败 [${i + 1}/${urls.length}]:`, url, result.iconError);
      }

      // 如果至少获取到标题或图标之一，则认为成功
      if (result.title || result.icons.length > 0) {
        result.success = true;
      } else {
        // 记录失败原因
        const errors = [];
        if (result.titleError) errors.push(`标题: ${result.titleError}`);
        if (result.iconError) errors.push(`图标: ${result.iconError}`);
        result.error = errors.length > 0 ? errors.join('; ') : '未知错误';
        
        // 错误分类
        if (result.error.includes('超时')) {
          result.errorType = 'timeout';
        } else if (result.error.includes('网络') || result.error.includes('Failed to fetch')) {
          result.errorType = 'network';
        } else if (result.error.includes('CORS')) {
          result.errorType = 'cors';
        } else {
          result.errorType = 'other';
        }
      }

      results.push(result);
      
      // 每处理10个URL记录一次进度
      if ((i + 1) % 10 === 0 || i === urls.length - 1) {
        const successCount = results.filter(r => r.success).length;
        console.info(`批量增强进度: ${i + 1}/${urls.length}, 成功: ${successCount}`);
      }
      
    } catch (error) {
      // 单个URL处理的意外错误
      const errorMessage = error.message || String(error);
      console.error(`URL处理异常 [${i + 1}/${urls.length}]:`, url, errorMessage);
      
      results.push({
        url,
        success: false,
        title: '',
        icons: [],
        error: `处理异常: ${errorMessage}`,
        errorType: 'exception'
      });
    }
  }

  // 统计最终结果
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.length - successCount;
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.info(`批量增强完成: 总计 ${results.length}, 成功 ${successCount}, 失败 ${failedCount}, 用时 ${duration}秒`);

  return results;
}


