/**
 * 增强书签导入器 - 核心类
 * 负责批量处理书签增强，包括获取真实标题和favicon图标
 * 支持并发控制、进度回调和错误处理
 */

import { Semaphore, ProgressTracker } from './enhancement-utils.js';
import { generateId, setIconDataUrl } from './storage.js';
import { t } from './i18n.js';

/**
 * 增强书签导入器类
 * 提供完整的书签增强导入功能
 */
export class EnhancedBookmarkImporter {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {number} options.concurrency - 并发数，默认8个
   * @param {number} options.timeout - 超时时间，默认8秒
   * @param {Function} options.onProgress - 进度回调函数
   * @param {Function} options.onError - 错误回调函数
   * @param {boolean} options.enableCache - 是否启用缓存，默认true
   * @param {boolean} options.enableDynamicConcurrency - 是否启用动态并发调整，默认true
   */
  constructor(options = {}) {
    this.concurrency = options.concurrency || 8;
    this.timeout = options.timeout || 8000;
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {});
    this.enableDynamicConcurrency = options.enableDynamicConcurrency !== false;
    
    // 初始化工具类
    this.semaphore = new Semaphore(this.concurrency);
    this.progressTracker = new ProgressTracker(this.onProgress, 100);
    
    // 动态并发调整相关
    this.failureWindow = []; // 失败记录窗口
    this.failureWindowSize = 20; // 窗口大小
    this.failureThreshold = 0.6; // 失败率阈值（60%）
    this.lastConcurrencyAdjustment = 0;
    this.concurrencyAdjustmentCooldown = 10000; // 调整冷却时间（10秒）
    
    // 统计信息
    this.stats = {
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: 0,
      errors: [],
      errorsByType: {
        timeout: 0,
        network: 0,
        http4xx: 0,
        http5xx: 0,
        cors: 0,
        ssl: 0,
        parse: 0,
        other: 0
      },
      concurrencyAdjustments: [] // 并发调整历史
    };
    
    // 控制标志
    this.cancelled = false;
  }

  /**
   * 从书签列表导入（用于已经处理过的书签数据）
   * @param {Array} bookmarkList - 已处理的书签列表
   * @returns {Promise<Object>} 导入结果
   */
  async importBookmarksFromList(bookmarkList) {
    try {
      // 重置状态
      this.cancelled = false;
      this.stats = {
        total: bookmarkList.length,
        processed: 0,
        successful: 0,
        failed: 0,
        startTime: Date.now(),
        errors: [],
        errorsByType: {
          timeout: 0,
          network: 0,
          http4xx: 0,
          http5xx: 0,
          cors: 0,
          ssl: 0,
          parse: 0,
          other: 0
        }
      };

      if (bookmarkList.length === 0) {
        return {
          success: true,
          stats: this.stats,
          bookmarks: []
        };
      }

      // 检查网络连接状态
      const isNetworkAvailable = await this._checkNetworkConnectivity();
      if (!isNetworkAvailable) {
        console.warn('网络连接不可用，将跳过增强功能');
        
        // 更新进度显示网络状态
        this.progressTracker.updateImmediate({
          ...this.stats,
          currentUrl: t('import.networkUnavailableSkip'),
          phase: 'network_unavailable'
        });
        
        // 返回基本书签信息，不进行增强
        const basicBookmarks = bookmarkList.map(bookmark => ({
          ...bookmark,
          originalTitle: bookmark.title,
          enhanced: false,
          enhancementError: t('import.networkUnavailableSkip'),
          enhancedAt: Date.now(),
          iconType: 'mono',
          mono: {
            letter: this._extractFirstLetter(bookmark.title || bookmark.url),
            color: this._pickColorFromString(bookmark.title || bookmark.url)
          }
        }));
        
        // 更新统计信息
        this.stats.processed = bookmarkList.length;
        this.stats.failed = bookmarkList.length;
        this._recordError('network', t('import.networkUnavailableAll'), 'network');
        
        return {
          success: true,
          stats: this.stats,
          bookmarks: basicBookmarks,
          networkUnavailable: true
        };
      }

      // 立即更新初始进度
      this.progressTracker.updateImmediate({
        ...this.stats,
        currentUrl: '',
        phase: 'starting'
      });

      // 批量增强书签
      const enhancedBookmarks = await this._processBatch(bookmarkList);

      // 更新最终进度
      this.progressTracker.updateImmediate({
        ...this.stats,
        currentUrl: '',
        phase: 'completed'
      });

      return {
        success: true,
        stats: this.stats,
        bookmarks: enhancedBookmarks
      };

    } catch (error) {
      this.onError(error);
      return {
        success: false,
        error: error.message || String(error),
        stats: this.stats,
        bookmarks: []
      };
    }
  }

  /**
   * 导入书签的主要方法
   * @param {Array} bookmarkTree - Chrome书签树结构
   * @returns {Promise<Object>} 导入结果
   */
  async importBookmarks(bookmarkTree) {
    try {
      // 重置状态
      this.cancelled = false;
      this.stats = {
        total: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        startTime: Date.now(),
        errors: [],
        errorsByType: {
          timeout: 0,
          network: 0,
          http4xx: 0,
          http5xx: 0,
          cors: 0,
          ssl: 0,
          parse: 0,
          other: 0
        }
      };

      // 提取所有书签URL
      const bookmarks = this._extractBookmarks(bookmarkTree);
      this.stats.total = bookmarks.length;

      if (bookmarks.length === 0) {
        return {
          success: true,
          stats: this.stats,
          bookmarks: []
        };
      }

      // 检查网络连接状态
      const isNetworkAvailable = await this._checkNetworkConnectivity();
      if (!isNetworkAvailable) {
        console.warn('网络连接不可用，将跳过增强功能');
        
        // 更新进度显示网络状态
        this.progressTracker.updateImmediate({
          ...this.stats,
          currentUrl: t('import.networkUnavailableSkip'),
          phase: 'network_unavailable'
        });
        
        // 返回基本书签信息，不进行增强
        const basicBookmarks = bookmarks.map(bookmark => ({
          ...bookmark,
          originalTitle: bookmark.title,
          enhanced: false,
          enhancementError: t('import.networkUnavailableSkip'),
          enhancedAt: Date.now(),
          iconType: 'mono',
          mono: {
            letter: this._extractFirstLetter(bookmark.title || bookmark.url),
            color: this._pickColorFromString(bookmark.title || bookmark.url)
          }
        }));
        
        // 更新统计信息
        this.stats.processed = bookmarks.length;
        this.stats.failed = bookmarks.length;
        this._recordError('network', t('import.networkUnavailableAll'), 'network');
        
        return {
          success: true,
          stats: this.stats,
          bookmarks: basicBookmarks,
          networkUnavailable: true
        };
      }

      // 立即更新初始进度
      this.progressTracker.updateImmediate({
        ...this.stats,
        currentUrl: '',
        phase: 'starting'
      });

      // 批量增强书签
      const enhancedBookmarks = await this._processBatch(bookmarks);

      // 更新最终进度
      this.progressTracker.updateImmediate({
        ...this.stats,
        currentUrl: '',
        phase: 'completed'
      });

      return {
        success: true,
        stats: this.stats,
        bookmarks: enhancedBookmarks
      };

    } catch (error) {
      this.onError(error);
      return {
        success: false,
        error: error.message || String(error),
        stats: this.stats,
        bookmarks: []
      };
    }
  }

  /**
   * 增强单个书签信息
   * 使用Chrome Bookmarks API获取标题，保持图标获取逻辑
   * @param {Object} bookmark - 书签对象
   * @returns {Promise<Object>} 增强后的书签对象
   */
  async enhanceBookmark(bookmark) {
    if (!bookmark || !bookmark.url) {
      return bookmark;
    }

    try {
      // 使用带错误恢复的增强方法
      const enhancedBookmark = await this.enhanceBookmarkWithFallback(bookmark);
      return enhancedBookmark;

    } catch (error) {
      // 增强失败时返回原始书签，添加错误标记
      return {
        ...bookmark,
        originalTitle: bookmark.title,
        enhanced: false,
        enhancementError: error.message || String(error),
        enhancedAt: Date.now()
      };
    }
  }

  /**
   * 带错误恢复机制的书签增强方法
   * 使用Chrome Bookmarks API获取标题，保持图标获取逻辑
   * @param {Object} bookmark - 原始书签对象
   * @returns {Promise<Object>} 增强后的书签对象（符合标准格式）
   */
  async enhanceBookmarkWithFallback(bookmark) {
    // 创建符合标准格式的书签对象
    const enhancedBookmark = {
      id: bookmark.id || generateId('b'),
      url: bookmark.url || '',
      name: bookmark.title || t('import.defaultUntitledBookmark'), // 使用name字段而不是title
      iconType: 'favicon',
      iconUrl: '',
      mono: null,
      remark: '',
      enhanced: false,
      enhancedAt: Date.now(),
      originalTitle: bookmark.title // 保留原始标题用于日志
    };

    let titleSuccess = false;
    let iconSuccess = false;

    // 使用Chrome Bookmarks API获取标题
    console.log(`🔍 [书签增强] 开始获取标题: "${bookmark.title}" -> ${bookmark.url}`);
    try {
      if (bookmark.id && chrome?.bookmarks?.get) {
        const results = await new Promise((resolve) => {
          chrome.bookmarks.get(bookmark.id, resolve);
        });
        
        if (results && results[0] && results[0].title) {
          // 清理书名中的JSON字符串，只保留真正的书名部分
          enhancedBookmark.name = this._cleanBookmarkTitle(results[0].title);
          titleSuccess = true;
          console.log(`✅ [书签增强] 标题更新成功: "${bookmark.title}" -> "${enhancedBookmark.name}":`, bookmark.url);
        } else {
          enhancedBookmark.name = this._cleanBookmarkTitle(bookmark.title) || t('import.defaultUntitledBookmark');
          console.log(`⚠️ [书签增强] 书签API返回空标题，保持原始标题: "${enhancedBookmark.name}":`, bookmark.url);
        }
      } else {
        enhancedBookmark.name = this._cleanBookmarkTitle(bookmark.title) || t('import.defaultUntitledBookmark');
        console.log(`⚠️ [书签增强] 无书签ID或API不可用，保持原始标题: "${enhancedBookmark.name}":`, bookmark.url);
      }
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.warn(`❌ [书签增强] 标题获取异常: ${errorMsg}:`, bookmark.url, error);
      this._recordError(bookmark.url, error, 'title');
      enhancedBookmark.name = this._cleanBookmarkTitle(bookmark.title) || t('import.defaultUntitledBookmark');
      console.log(`🔄 [书签增强] 使用原始标题作为备选: "${enhancedBookmark.name}":`, bookmark.url);
    }

    // 尝试获取favicon图标（保持原有逻辑）
    try {
      const iconResult = await this._fetchFaviconWithTimeout(bookmark.url);
      if (iconResult && iconResult.length > 0) {
        enhancedBookmark.iconType = 'favicon';
        enhancedBookmark.iconUrl = iconResult[0];
        iconSuccess = true;
        
        // 尝试预先获取并缓存base64数据，但不阻塞主流程
        this._preloadIconToCache(iconResult[0]).catch(() => {
          // 静默忽略预加载失败，不影响书签导入
        });
      }
    } catch (error) {
      this._recordError(bookmark.url, error, 'favicon');
    }

    // 如果图标获取失败，使用单色图标备选方案
    if (!iconSuccess) {
      const displayTitle = enhancedBookmark.name || enhancedBookmark.originalTitle || enhancedBookmark.url;
      const letter = this._extractFirstLetter(displayTitle);
      
      enhancedBookmark.iconType = 'mono';
      enhancedBookmark.mono = {
        letter: letter.toUpperCase(),
        color: this._pickColorFromString(letter)
      };
    }

    // 如果至少有一项增强成功，标记为已增强
    enhancedBookmark.enhanced = titleSuccess || iconSuccess;

    // 移除临时字段，返回标准格式的书签
    delete enhancedBookmark.originalTitle;
    return enhancedBookmark;
  }

  /**
   * 获取网站favicon
   * @param {string} url - 网站URL
   * @returns {Promise<string[]>} 图标URL数组
   */
  async fetchFavicon(url) {
    try {
      const iconsResult = await this._fetchFaviconWithTimeout(url);
      return iconsResult || [];
    } catch (error) {
      console.warn('获取图标失败:', url, error);
      return [];
    }
  }

  /**
   * 取消导入操作
   */
  cancel() {
    console.log('取消书签导入操作');
    this.cancelled = true;
    
    // 取消信号量中的等待请求
    if (this.semaphore) {
      this.semaphore.cancel();
    }
    
    // 更新进度显示
    this.progressTracker.updateImmediate({
      ...this.stats,
        currentUrl: t('import.operationCancelled'),
      phase: 'cancelled'
    });
  }

  /**
   * 获取当前统计信息
   * @returns {Object} 统计信息对象
   */
  getStats() {
    return {
      ...this.stats,
      cacheStats: this.cache ? this.cache.getStats() : null,
      semaphoreStatus: this.semaphore.getStatus()
    };
  }

  /**
   * 销毁导入器，清理资源
   */
  destroy() {
    this.cancelled = true;
    
    // 清理进度跟踪器
    if (this.progressTracker) {
      this.progressTracker.destroy();
    }
    
    // 清理缓存
    if (this.cache) {
      this.cache.clear();
    }
    
    // 重置信号量
    if (this.semaphore) {
      this.semaphore.reset();
    }
    
    // 清理失败记录
    this.failureWindow = [];
  }

  /**
   * 检测网络连接状态
   * @returns {Promise<boolean>} 网络是否可用
   * @private
   */
  async _checkNetworkConnectivity() {
    try {
      // 尝试请求一个可靠的测试URL
      const testUrls = [
        'https://www.google.com/favicon.ico',
        'https://www.baidu.com/favicon.ico',
        'https://httpbin.org/status/200'
      ];
      
      for (const testUrl of testUrls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
          
          const response = await fetch(testUrl, {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'no-cors' // 避免CORS问题
          });
          
          clearTimeout(timeoutId);
          
          // 如果任何一个测试URL成功，说明网络可用
          return true;
        } catch (e) {
          // 继续尝试下一个URL
          continue;
        }
      }
      
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * 记录和分类错误信息
   * @param {string} url - 出错的URL
   * @param {Error|string} error - 错误对象或错误信息
   * @param {string} context - 错误上下文（如'title'、'favicon'等）
   * @private
   */
  _recordError(url, error, context = 'unknown') {
    const errorMessage = error?.message || String(error);
    const timestamp = Date.now();
    
    // 错误分类
    let errorType = 'other';
    if (errorMessage.includes('超时') || errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      errorType = 'timeout';
    } else if (errorMessage.includes('网络错误') || errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      errorType = 'network';
    } else if (errorMessage.includes('HTTP 4') || errorMessage.includes('客户端错误')) {
      errorType = 'http4xx';
    } else if (errorMessage.includes('HTTP 5') || errorMessage.includes('服务器错误')) {
      errorType = 'http5xx';
    } else if (errorMessage.includes('CORS') || errorMessage.includes('跨域')) {
      errorType = 'cors';
    } else if (errorMessage.includes('SSL') || errorMessage.includes('certificate')) {
      errorType = 'ssl';
    } else if (errorMessage.includes('解析') || errorMessage.includes('parse')) {
      errorType = 'parse';
    }
    
    // 更新错误统计
    this.stats.errorsByType[errorType]++;
    
    // 记录详细错误信息
    const errorRecord = {
      url,
      error: errorMessage,
      type: errorType,
      context,
      timestamp
    };
    
    this.stats.errors.push(errorRecord);
    
    // 详细日志记录
    const logLevel = errorType === 'cors' ? 'info' : 'warn';
    console[logLevel](`书签增强错误 [${errorType}] [${context}]:`, url, errorMessage);
    
    return errorRecord;
  }

  // ==================== 私有方法 ====================

  /**
   * 清理书签标题，移除JSON字符串等冗余信息
   * @param {string} title - 原始书签标题
   * @returns {string} 清理后的书签标题
   * @private
   */
  _cleanBookmarkTitle(title) {
    if (!title) return '';
    
    // 如果标题包含JSON字符串（如：BOSS{"favicon":"..."}），提取前面的文本部分
    const jsonMatch = title.match(/^([^{]+)({.*})$/);
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1].trim();
    }
    
    // 返回原始标题（去除前后空格）
    return title.trim();
  }

  /**
   * 从书签树中提取所有书签
   * @param {Array} bookmarkTree - Chrome书签树
   * @returns {Array} 书签数组
   * @private
   */
  _extractBookmarks(bookmarkTree) {
    const bookmarks = [];
    
    const traverse = (nodes) => {
      if (!Array.isArray(nodes)) return;
      
      for (const node of nodes) {
        if (node.url) {
          // 是书签
          bookmarks.push({
            id: node.id,
            title: node.title || t('import.defaultUntitledBookmark'),
            url: node.url,
            dateAdded: node.dateAdded || Date.now()
          });
        } else if (node.children) {
          // 是文件夹，递归处理
          traverse(node.children);
        }
      }
    };
    
    traverse(bookmarkTree);
    return bookmarks;
  }

  /**
   * 批量处理书签增强
   * @param {Array} bookmarks - 书签数组
   * @returns {Promise<Array>} 增强后的书签数组
   * @private
   */
  async _processBatch(bookmarks) {
    const enhancedBookmarks = [];
    const promises = [];

    for (let i = 0; i < bookmarks.length; i++) {
      if (this.cancelled) {
        break;
      }

      const bookmark = bookmarks[i];
      
      // 创建处理Promise
      const processPromise = this._processBookmarkWithSemaphore(bookmark, i);
      promises.push(processPromise);
    }

    // 等待所有处理完成
    const results = await Promise.allSettled(promises);
    
    // 收集结果
    for (const result of results) {
      if (result.status === 'fulfilled') {
        enhancedBookmarks.push(result.value);
      }
    }

    return enhancedBookmarks;
  }

  /**
   * 使用信号量控制的书签处理
   * @param {Object} bookmark - 书签对象
   * @param {number} index - 书签索引
   * @returns {Promise<Object>} 处理后的书签
   * @private
   */
  async _processBookmarkWithSemaphore(bookmark, index) {
    // 获取信号量许可
    await this.semaphore.acquire();
    
    try {
      if (this.cancelled) {
        return bookmark;
      }

      // 更新进度
      this.progressTracker.update({
        ...this.stats,
        currentUrl: bookmark.url,
        currentIndex: index,
        phase: 'processing'
      });

      // 增强书签
      const enhanced = await this.enhanceBookmark(bookmark);
      
      // 更新统计
      this.stats.processed++;
      if (enhanced.enhanced) {
        this.stats.successful++;
        this._recordProcessingResult(true);
      } else {
        this.stats.failed++;
        this._recordProcessingResult(false);
        if (enhanced.enhancementError) {
          this._recordError(bookmark.url, enhanced.enhancementError, 'enhancement');
        }
      }

      // 检查是否需要调整并发数
      this._checkAndAdjustConcurrency();

      return enhanced;

    } catch (error) {
      // 处理异常
      this.stats.processed++;
      this.stats.failed++;
      this._recordProcessingResult(false);
      this._recordError(bookmark.url, error, 'processing');

      // 检查是否需要调整并发数
      this._checkAndAdjustConcurrency();

      this.onError(error);
      
      return {
        ...bookmark,
        enhanced: false,
        enhancementError: error.message || String(error)
      };

    } finally {
      // 释放信号量许可
      this.semaphore.release();
    }
  }




  /**
   * 带超时控制的图标获取方法
   * @param {string} url - 网站URL
   * @returns {Promise<string[]>} 图标URL数组
   * @private
   */
  async _fetchFaviconWithTimeout(url) {
    const isExtensionMode = !window.__MYTAB_USE_PROXY__;
    
    if (isExtensionMode && window.chrome && chrome.runtime) {
      // 扩展模式：使用后台服务
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(t('webdav.requestTimeout', { ms: this.timeout }))), this.timeout);
      });

      const iconPromise = chrome.runtime.sendMessage({ type: 'favicon:fetch', pageUrl: url });
      const result = await Promise.race([iconPromise, timeoutPromise]);
      
      return result?.icons || [];
    } else {
      // Web模式：使用基本的favicon URL
      return [new URL('/favicon.ico', url).href];
    }
  }

  /**
   * Web模式下直接获取标题，包含完整的错误处理
   * @param {string} url - 网站URL
   * @returns {Promise<string>} 网站标题
   * @private
   */
  async _fetchTitleDirectly(url) {
    console.log(`🌐 [Web模式] 开始直接请求标题:`, url);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      console.log(`📡 [Web模式] 发送HTTP请求:`, url);
      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      clearTimeout(timeoutId);
      
      console.log(`📊 [Web模式] HTTP响应状态:`, response.status, response.statusText, url);

      // HTTP错误处理（4xx/5xx状态码）
      if (!response.ok) {
        const errorType = response.status >= 500 ? '服务器错误' : 
                         response.status >= 400 ? '客户端错误' : '未知错误';
        const errorMsg = `Web模式标题获取失败 - ${errorType} (${response.status})`;
        console.warn(`❌ [Web模式] ${errorMsg}:`, url);
        return null;
      }

      // 检查Content-Type
      const contentType = response.headers.get('content-type') || '';
      console.log(`📄 [Web模式] Content-Type:`, contentType, url);
      
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        const errorMsg = 'Web模式标题获取失败 - 非HTML内容';
        console.warn(`❌ [Web模式] ${errorMsg}:`, url, contentType);
        return null;
      }

      console.log(`📖 [Web模式] 开始解析HTML内容:`, url);
      const html = await response.text();
      const htmlLength = html.length;
      console.log(`📖 [Web模式] HTML内容长度: ${htmlLength} 字符:`, url);
      
      // HTML解析错误处理
      try {
        // 使用更强健的正则表达式，支持多行和各种空白字符
        const titleMatch = html.match(/<title[^>]*>\s*([^<]*?)\s*<\/title>/is);
        
        console.log(`🔍 [Web模式] title标签匹配结果:`, titleMatch ? `找到: "${titleMatch[1]}"` : '未找到', url);
        
        if (titleMatch && titleMatch[1]) {
          const rawTitle = titleMatch[1];
          const cleanTitle = rawTitle
            .replace(/\s+/g, ' ')  // 将多个空白字符替换为单个空格
            .trim();
          
          console.log(`🧹 [Web模式] 标题清理: "${rawTitle}" -> "${cleanTitle}":`, url);
          
          if (cleanTitle.length > 0) {
            console.log(`✅ [Web模式] 成功获取标题: "${cleanTitle}":`, url);
            return cleanTitle;
          } else {
            console.warn(`⚠️ [Web模式] 标题为空字符串:`, url);
          }
        }
        
        // 备选方案：尝试查找H1标签
        console.log(`🔍 [Web模式] 尝试查找H1标签:`, url);
        const h1Match = html.match(/<h1[^>]*>\s*([^<]*?)\s*<\/h1>/is);
        
        console.log(`🔍 [Web模式] H1标签匹配结果:`, h1Match ? `找到: "${h1Match[1]}"` : '未找到', url);
        
        if (h1Match && h1Match[1]) {
          const h1Title = h1Match[1].replace(/\s+/g, ' ').trim();
          if (h1Title.length > 0) {
            console.log(`✅ [Web模式] 使用H1标签作为标题: "${h1Title}":`, url);
            return h1Title;
          }
        }
        
        console.warn(`❌ [Web模式] 未找到有效的标题内容:`, url);
        return null; // 返回null表示获取失败，而不是空字符串
      } catch (parseError) {
        const errorMsg = `Web模式HTML解析错误: ${parseError.message}`;
        console.warn(`❌ [Web模式] ${errorMsg}:`, url, parseError);
        return null; // 返回null表示获取失败，而不是空字符串
      }
      
    } catch (error) {
      // 详细的错误分类和日志记录
      let errorType = '未知错误';
      let errorMessage = error.message || String(error);
      
      if (error.name === 'AbortError') {
        errorType = '请求超时';
        errorMessage = `Web模式请求超时 (${this.timeout}ms)`;
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorType = '网络错误';
        errorMessage = 'Web模式无法连接到服务器';
      } else if (error.message.includes('CORS')) {
        errorType = 'CORS错误';
        errorMessage = 'Web模式跨域请求被阻止（这是正常现象）';
      } else if (error.message.includes('SSL') || error.message.includes('certificate')) {
        errorType = 'SSL错误';
        errorMessage = 'Web模式SSL证书验证失败';
      }
      
      // CORS错误在Web模式下是常见的，使用info级别日志
      if (errorType === 'CORS错误') {
        console.info(`ℹ️ [Web模式] ${errorType}: ${errorMessage}:`, url);
      } else {
        console.warn(`❌ [Web模式] ${errorType}: ${errorMessage}:`, url, error);
      }
      
      return null; // 返回null表示获取失败，而不是空字符串
    }
  }

  /**
   * 从字符串中提取第一个有效字符作为图标字母
   * @param {string} str - 输入字符串
   * @returns {string} 提取的字符
   * @private
   */
  _extractFirstLetter(str) {
    if (!str) return 'W';
    
    // 优先提取英文字母或数字
    const englishMatch = str.match(/[a-zA-Z0-9]/);
    if (englishMatch) {
      return englishMatch[0];
    }
    
    // 如果没有英文字母，提取第一个字符（包括中文等）
    const firstChar = str.charAt(0);
    if (firstChar) {
      return firstChar;
    }
    
    // 默认返回 'W'
    return 'W';
  }

  /**
   * 从字符串生成颜色
   * @param {string} str - 输入字符串
   * @returns {string} 十六进制颜色值
   * @private
   */
  _pickColorFromString(str) {
    const colors = [
      '#ef4444', '#f97316', '#f59e0b', '#eab308',
      '#84cc16', '#22c55e', '#10b981', '#14b8a6',
      '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
      '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
    ];
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * 记录处理结果用于动态并发调整
   * @param {boolean} success - 是否成功
   * @private
   */
  _recordProcessingResult(success) {
    if (!this.enableDynamicConcurrency) {
      return;
    }

    const now = Date.now();
    this.failureWindow.push({
      success,
      timestamp: now
    });

    // 保持窗口大小
    if (this.failureWindow.length > this.failureWindowSize) {
      this.failureWindow.shift();
    }
  }

  /**
   * 检查并调整并发数
   * @private
   */
  _checkAndAdjustConcurrency() {
    if (!this.enableDynamicConcurrency || this.failureWindow.length < this.failureWindowSize) {
      return;
    }

    const now = Date.now();
    
    // 检查冷却时间
    if (now - this.lastConcurrencyAdjustment < this.concurrencyAdjustmentCooldown) {
      return;
    }

    // 计算最近的失败率
    const recentFailures = this.failureWindow.filter(record => !record.success).length;
    const failureRate = recentFailures / this.failureWindow.length;

    const currentConcurrency = this.semaphore.max;

    if (failureRate >= this.failureThreshold && currentConcurrency > 1) {
      // 失败率过高，降低并发数
      const newConcurrency = Math.max(1, Math.floor(currentConcurrency * 0.7));
      this.semaphore.adjustConcurrency(newConcurrency);
      
      this.stats.concurrencyAdjustments.push({
        timestamp: now,
        from: currentConcurrency,
        to: newConcurrency,
        reason: `失败率过高 (${(failureRate * 100).toFixed(1)}%)`
      });
      
      this.lastConcurrencyAdjustment = now;
      console.log(`动态并发调整: ${currentConcurrency} -> ${newConcurrency} (失败率: ${(failureRate * 100).toFixed(1)}%)`);
      
    } else if (failureRate < 0.2 && currentConcurrency < this.concurrency) {
      // 失败率较低，可以适当提高并发数
      const newConcurrency = Math.min(this.concurrency, currentConcurrency + 1);
      this.semaphore.adjustConcurrency(newConcurrency);
      
      this.stats.concurrencyAdjustments.push({
        timestamp: now,
        from: currentConcurrency,
        to: newConcurrency,
        reason: `失败率较低 (${(failureRate * 100).toFixed(1)}%)`
      });
      
      this.lastConcurrencyAdjustment = now;
      console.log(`动态并发调整: ${currentConcurrency} -> ${newConcurrency} (失败率: ${(failureRate * 100).toFixed(1)}%)`);
    }
  }

  /**
   * 预加载图标到缓存
   * 在后台异步获取图标的base64数据并存储到iconData缓存中
   * @param {string} iconUrl - 图标URL
   * @returns {Promise<void>}
   * @private
   */
  async _preloadIconToCache(iconUrl) {
    if (!iconUrl) return;
    
    try {
      // 检查是否为扩展环境
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        // 扩展模式：使用外部API服务
        const apiUrl = 'https://mt.agnet.top/image/url-to-base64';
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: iconUrl })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.data.base64_data) {
            const dataUrl = `data:${data.data.content_type || 'image/png'};base64,${data.data.base64_data}`;
            await setIconDataUrl(iconUrl, dataUrl);
          }
        }
      } else {
        // Web模式：使用代理API
        const response = await fetch('/api/favicon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: iconUrl })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.data.base64_data) {
            const dataUrl = `data:${data.data.content_type || 'image/png'};base64,${data.data.base64_data}`;
            await setIconDataUrl(iconUrl, dataUrl);
          }
        }
      }
    } catch (e) {
      // 静默忽略预加载失败，不影响主流程
    }
  }
}
