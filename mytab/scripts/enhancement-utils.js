/**
 * 增强书签导入功能的核心工具类
 * 包含并发控制、进度跟踪和缓存功能
 */

/**
 * 信号量类 - 控制并发数量
 * 用于限制同时进行的网络请求数量，避免对服务器造成过大压力
 * 支持动态调整并发数
 */
export class Semaphore {
  /**
   * 构造函数
   * @param {number} max - 最大并发数，默认为8
   */
  constructor(max = 8) {
    this.max = max;
    this.initialMax = max; // 保存初始并发数
    this.current = 0;
    this.queue = [];
    this.cancelled = false;
  }

  /**
   * 获取信号量许可
   * 如果当前并发数未达到上限，立即返回
   * 否则将请求加入队列等待
   * @returns {Promise<void>}
   */
  async acquire() {
    if (this.cancelled) {
      throw new Error('Semaphore cancelled');
    }
    
    if (this.current < this.max) {
      this.current++;
      return;
    }
    
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  /**
   * 释放信号量许可
   * 如果队列中有等待的请求，立即处理下一个
   */
  release() {
    this.current--;
    if (this.queue.length > 0 && !this.cancelled) {
      const { resolve } = this.queue.shift();
      this.current++;
      resolve();
    }
  }

  /**
   * 动态调整并发数
   * @param {number} newMax - 新的最大并发数
   */
  adjustConcurrency(newMax) {
    if (newMax < 1) newMax = 1;
    if (newMax > this.initialMax) newMax = this.initialMax;
    
    const oldMax = this.max;
    this.max = newMax;
    
    console.log(`并发数调整: ${oldMax} -> ${newMax}`);
    
    // 如果增加了并发数，处理队列中的等待请求
    if (newMax > oldMax) {
      const canProcess = Math.min(newMax - this.current, this.queue.length);
      for (let i = 0; i < canProcess; i++) {
        if (this.queue.length > 0 && !this.cancelled) {
          const { resolve } = this.queue.shift();
          this.current++;
          resolve();
        }
      }
    }
  }

  /**
   * 取消所有等待的请求
   */
  cancel() {
    this.cancelled = true;
    
    // 拒绝所有等待中的请求
    while (this.queue.length > 0) {
      const { reject } = this.queue.shift();
      reject(new Error('Operation cancelled'));
    }
  }

  /**
   * 重置信号量状态
   */
  reset() {
    this.cancelled = false;
    this.max = this.initialMax;
    this.current = 0;
    
    // 清空队列
    while (this.queue.length > 0) {
      const { reject } = this.queue.shift();
      reject(new Error('Semaphore reset'));
    }
  }

  /**
   * 获取当前状态信息
   * @returns {Object} 包含当前并发数、最大并发数和队列长度的对象
   */
  getStatus() {
    return {
      current: this.current,
      max: this.max,
      initialMax: this.initialMax,
      queued: this.queue.length,
      cancelled: this.cancelled
    };
  }
}

/**
 * 进度跟踪类 - 防抖更新进度信息
 * 避免过于频繁的UI更新，提升性能
 * 支持时间估算和性能监控
 */
export class ProgressTracker {
  /**
   * 构造函数
   * @param {Function} onUpdate - 进度更新回调函数
   * @param {number} debounceMs - 防抖延迟时间，默认100毫秒
   */
  constructor(onUpdate, debounceMs = 100) {
    this.onUpdate = onUpdate;
    this.debounceMs = debounceMs;
    this.updateTimer = null;
    this.pendingUpdate = null;
    this.lastUpdateTime = 0;
    
    // 时间估算相关
    this.startTime = null;
    this.processedHistory = []; // 存储处理历史用于计算平均速度
    this.maxHistorySize = 10; // 最多保留10个历史记录点
  }

  /**
   * 更新进度信息
   * 使用防抖机制避免过于频繁的更新
   * @param {Object} progress - 进度信息对象
   */
  update(progress) {
    // 记录开始时间
    if (this.startTime === null && progress.processed > 0) {
      this.startTime = Date.now();
    }
    
    // 计算时间估算
    const enhancedProgress = this._enhanceProgressWithTimeEstimate(progress);
    this.pendingUpdate = enhancedProgress;
    
    // 清除之前的定时器
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    // 设置新的防抖定时器
    this.updateTimer = setTimeout(() => {
      if (this.pendingUpdate) {
        this.onUpdate(this.pendingUpdate);
        this.pendingUpdate = null;
        this.lastUpdateTime = Date.now();
      }
    }, this.debounceMs);
  }

  /**
   * 立即更新进度（跳过防抖）
   * 用于重要的进度节点，如开始、完成等
   * @param {Object} progress - 进度信息对象
   */
  updateImmediate(progress) {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    
    // 记录开始时间
    if (this.startTime === null && progress.processed > 0) {
      this.startTime = Date.now();
    }
    
    // 计算时间估算
    const enhancedProgress = this._enhanceProgressWithTimeEstimate(progress);
    
    this.onUpdate(enhancedProgress);
    this.pendingUpdate = null;
    this.lastUpdateTime = Date.now();
  }

  /**
   * 增强进度信息，添加时间估算
   * @param {Object} progress - 原始进度信息
   * @returns {Object} 增强后的进度信息
   * @private
   */
  _enhanceProgressWithTimeEstimate(progress) {
    const now = Date.now();
    const enhancedProgress = { ...progress };
    
    // 如果还没开始或没有处理任何项目，返回原始进度
    if (!this.startTime || !progress.processed || progress.processed === 0) {
      return enhancedProgress;
    }
    
    // 计算已用时间
    const elapsedMs = now - this.startTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    
    // 更新处理历史
    this._updateProcessedHistory(progress.processed, now);
    
    // 计算平均处理速度（项目/秒）
    const avgSpeed = this._calculateAverageSpeed();
    
    // 计算剩余时间估算
    const remaining = (progress.total || 0) - progress.processed;
    let estimatedRemainingSeconds = 0;
    
    if (avgSpeed > 0 && remaining > 0) {
      estimatedRemainingSeconds = Math.ceil(remaining / avgSpeed);
    }
    
    // 添加时间信息到进度对象
    enhancedProgress.timing = {
      elapsedSeconds,
      elapsedText: this._formatDuration(elapsedSeconds),
      estimatedRemainingSeconds,
      estimatedRemainingText: this._formatDuration(estimatedRemainingSeconds),
      avgSpeed: avgSpeed.toFixed(2),
      totalEstimatedSeconds: elapsedSeconds + estimatedRemainingSeconds,
      totalEstimatedText: this._formatDuration(elapsedSeconds + estimatedRemainingSeconds)
    };
    
    return enhancedProgress;
  }

  /**
   * 更新处理历史记录
   * @param {number} processed - 当前已处理数量
   * @param {number} timestamp - 时间戳
   * @private
   */
  _updateProcessedHistory(processed, timestamp) {
    this.processedHistory.push({
      processed,
      timestamp
    });
    
    // 保持历史记录大小限制
    if (this.processedHistory.length > this.maxHistorySize) {
      this.processedHistory.shift();
    }
  }

  /**
   * 计算平均处理速度
   * @returns {number} 平均速度（项目/秒）
   * @private
   */
  _calculateAverageSpeed() {
    if (this.processedHistory.length < 2) {
      return 0;
    }
    
    const first = this.processedHistory[0];
    const last = this.processedHistory[this.processedHistory.length - 1];
    
    const timeDiff = (last.timestamp - first.timestamp) / 1000; // 转换为秒
    const processedDiff = last.processed - first.processed;
    
    if (timeDiff <= 0) {
      return 0;
    }
    
    return processedDiff / timeDiff;
  }

  /**
   * 格式化时间长度
   * @param {number} seconds - 秒数
   * @returns {string} 格式化的时间字符串
   * @private
   */
  _formatDuration(seconds) {
    if (seconds <= 0) {
      return '0秒';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分${secs}秒`;
    } else {
      return `${secs}秒`;
    }
  }

  /**
   * 重置时间跟踪
   */
  reset() {
    this.startTime = null;
    this.processedHistory = [];
  }

  /**
   * 销毁进度跟踪器
   * 清理定时器资源
   */
  destroy() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this.pendingUpdate = null;
    this.processedHistory = [];
    this.startTime = null;
  }
}

/**
 * 增强缓存类 - 避免重复请求相同URL
 * 在导入过程中缓存已获取的标题和图标信息
 * 支持内存使用监控和自动清理
 */
export class EnhancementCache {
  /**
   * 构造函数
   * @param {number} maxSize - 最大缓存条目数，默认1000
   * @param {number} maxMemoryMB - 最大内存使用量（MB），默认50MB
   */
  constructor(maxSize = 1000, maxMemoryMB = 50) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
    this.hitCount = 0;
    this.missCount = 0;
    this.currentMemoryUsage = 0;
    this.cleanupThreshold = 0.8; // 当内存使用达到80%时开始清理
  }

  /**
   * 从缓存中获取数据
   * @param {string} url - 要查询的URL
   * @returns {Object|undefined} 缓存的数据或undefined
   */
  get(url) {
    const data = this.cache.get(url);
    if (data) {
      this.hitCount++;
      // 更新访问时间，用于LRU策略
      data.lastAccessed = Date.now();
      return data.value;
    } else {
      this.missCount++;
      return undefined;
    }
  }

  /**
   * 将数据存入缓存
   * @param {string} url - URL键
   * @param {Object} data - 要缓存的数据
   */
  set(url, data) {
    // 估算数据大小
    const dataSize = this._estimateDataSize(url, data);
    
    // 检查是否需要清理内存
    if (this._shouldCleanupMemory(dataSize)) {
      this._cleanupMemory();
    }
    
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      this._evictOldest();
    }
    
    const cacheEntry = {
      value: data,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      size: dataSize
    };
    
    this.cache.set(url, cacheEntry);
    this.currentMemoryUsage += dataSize;
  }

  /**
   * 检查缓存中是否存在指定URL
   * @param {string} url - 要检查的URL
   * @returns {boolean} 是否存在
   */
  has(url) {
    return this.cache.has(url);
  }

  /**
   * 从缓存中删除指定URL
   * @param {string} url - 要删除的URL
   * @returns {boolean} 是否成功删除
   */
  delete(url) {
    const entry = this.cache.get(url);
    if (entry) {
      this.currentMemoryUsage -= entry.size || 0;
    }
    return this.cache.delete(url);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.currentMemoryUsage = 0;
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 包含缓存大小、命中率等信息的对象
   */
  getStats() {
    const total = this.hitCount + this.missCount;
    const memoryUsageMB = (this.currentMemoryUsage / (1024 * 1024)).toFixed(2);
    const maxMemoryMB = (this.maxMemoryBytes / (1024 * 1024)).toFixed(2);
    const memoryUsagePercent = ((this.currentMemoryUsage / this.maxMemoryBytes) * 100).toFixed(1);
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? (this.hitCount / total * 100).toFixed(2) + '%' : '0%',
      memoryUsageMB: `${memoryUsageMB}MB`,
      maxMemoryMB: `${maxMemoryMB}MB`,
      memoryUsagePercent: `${memoryUsagePercent}%`
    };
  }

  /**
   * 删除最旧的缓存条目（LRU策略）
   * @private
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, value] of this.cache.entries()) {
      if (value.lastAccessed < oldestTime) {
        oldestTime = value.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.currentMemoryUsage -= entry.size || 0;
      }
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 估算数据大小（字节）
   * @param {string} url - URL键
   * @param {Object} data - 数据对象
   * @returns {number} 估算的字节大小
   * @private
   */
  _estimateDataSize(url, data) {
    // 简单的字符串大小估算（UTF-8编码）
    let size = url.length * 2; // URL键的大小
    
    if (data.title) {
      size += data.title.length * 2;
    }
    
    if (data.iconUrl) {
      size += data.iconUrl.length * 2;
    }
    
    if (data.mono) {
      size += JSON.stringify(data.mono).length * 2;
    }
    
    // 添加对象开销估算
    size += 200; // 对象结构开销
    
    return size;
  }

  /**
   * 检查是否需要清理内存
   * @param {number} newDataSize - 新数据的大小
   * @returns {boolean} 是否需要清理
   * @private
   */
  _shouldCleanupMemory(newDataSize) {
    const projectedUsage = this.currentMemoryUsage + newDataSize;
    return projectedUsage > (this.maxMemoryBytes * this.cleanupThreshold);
  }

  /**
   * 清理内存，删除最旧的条目直到内存使用降到安全水平
   * @private
   */
  _cleanupMemory() {
    const targetUsage = this.maxMemoryBytes * 0.6; // 清理到60%使用率
    
    // 按访问时间排序，删除最旧的条目
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    let cleanedCount = 0;
    for (const [key, entry] of entries) {
      if (this.currentMemoryUsage <= targetUsage) {
        break;
      }
      
      this.currentMemoryUsage -= entry.size || 0;
      this.cache.delete(key);
      cleanedCount++;
    }
    
    if (cleanedCount > 0) {
      console.log(`缓存内存清理: 删除了 ${cleanedCount} 个条目，当前使用: ${(this.currentMemoryUsage / (1024 * 1024)).toFixed(2)}MB`);
    }
  }

  /**
   * 清理过期的缓存条目
   * @param {number} maxAge - 最大缓存时间（毫秒），默认1小时
   */
  cleanup(maxAge = 60 * 60 * 1000) {
    const now = Date.now();
    const keysToDelete = [];
    let freedMemory = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.createdAt > maxAge) {
        keysToDelete.push(key);
        freedMemory += value.size || 0;
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    this.currentMemoryUsage -= freedMemory;
    
    if (keysToDelete.length > 0) {
      console.log(`缓存过期清理: 删除了 ${keysToDelete.length} 个条目，释放 ${(freedMemory / 1024).toFixed(2)}KB 内存`);
    }
    
    return keysToDelete.length;
  }
}