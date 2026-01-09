/**
 * WebDAV 性能日志工具
 * 用于记录和输出操作耗时
 */
class WebDAVLogger {
  /**
   * 记录操作开始时间并返回计时器
   * @param {string} operation - 操作名称
   * @returns {Function} 结束计时的函数
   */
  static time(operation) {
    const startTime = performance.now();
    console.log(`🔄 WebDAV ${operation} 开始...`);
    
    return (result = null, error = null) => {
      const endTime = performance.now();
      const duration = Math.round((endTime - startTime) * 100) / 100; // 保留2位小数
      
      if (error) {
        console.error(`❌ WebDAV ${operation} 失败 (${duration}ms):`, error);
      } else {
        console.log(`✅ WebDAV ${operation} 完成 (${duration}ms)`, result ? `- ${JSON.stringify(result).slice(0, 100)}...` : '');
      }
      
      return { duration, result, error };
    };
  }
}

/**
 * 轻量级 WebDAV 客户端实现
 * 基于 fetch API，支持基本的 WebDAV 操作
 * 包括文件上传、下载、删除和列举功能
 */

export class WebDAVClient {
  // 静态验证缓存，跨实例共享
  static _globalValidationCache = new Map();
  
  // 缓存配置常量
  static CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存时间
  static MAX_CACHE_SIZE = 100; // 最大缓存条目数
  static GC_THRESHOLD = 0.8; // 垃圾回收阈值（80%时触发）
  
  /**
   * 构造函数 - 初始化 WebDAV 客户端
   * @param {Object} config - 配置对象
   * @param {string} config.url - WebDAV 服务器 URL
   * @param {string} config.username - 用户名（可选）
   * @param {string} config.password - 密码（可选）
   */
  constructor(config) {
    // 确保 URL 以斜杠结尾，便于后续路径拼接
    this.url = (config?.url || '').replace(/\/*$/, '/');
    this.username = config?.username || '';
    this.password = config?.password || '';
    this.basePath = ''; // 基础路径，暂未使用
    
    // 验证缓存：使用全局缓存
    this._configHash = this._getConfigHash();
    
    // 创建实例时触发垃圾回收检查
    this._maybeRunGarbageCollection();
  }
  
  /**
   * 清除所有WebDAV验证缓存（静态方法）
   */
  static clearAllValidationCache() {
    WebDAVClient._globalValidationCache.clear();
    console.log('🧹 所有WebDAV验证缓存已清除');
  }
  
  /**
   * 垃圾回收机制 - 清理过期和最少使用的缓存条目
   * @private
   */
  _maybeRunGarbageCollection() {
    const cache = WebDAVClient._globalValidationCache;
    const currentSize = cache.size;
    const maxSize = WebDAVClient.MAX_CACHE_SIZE;
    
    // 如果缓存大小超过阈值，触发垃圾回收
    if (currentSize >= maxSize * WebDAVClient.GC_THRESHOLD) {
      console.log(`🗑️ WebDAV缓存垃圾回收开始: 当前${currentSize}条，阈值${Math.floor(maxSize * WebDAVClient.GC_THRESHOLD)}条`);
      
      const now = Date.now();
      const expiredKeys = [];
      const validEntries = [];
      
      // 第一轮：清理过期条目
      for (const [key, entry] of cache.entries()) {
        const age = now - entry.timestamp;
        if (age > WebDAVClient.CACHE_DURATION) {
          expiredKeys.push(key);
        } else {
          validEntries.push([key, entry]);
        }
      }
      
      // 删除过期条目
      expiredKeys.forEach(key => cache.delete(key));
      
      // 第二轮：如果仍然超过限制，使用LRU策略清理
      const remainingSize = cache.size;
      if (remainingSize > maxSize * 0.7) { // 清理到70%
        const targetSize = Math.floor(maxSize * 0.7);
        const toRemove = remainingSize - targetSize;
        
        // 按最后访问时间排序，删除最少使用的条目
        validEntries
          .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed) // 按访问时间升序
          .slice(0, toRemove) // 取前N个最少使用的
          .forEach(([key]) => cache.delete(key));
      }
      
      const finalSize = cache.size;
      const cleanedCount = currentSize - finalSize;
      
      if (cleanedCount > 0) {
        console.log(`🧹 WebDAV缓存垃圾回收完成: 清理了${cleanedCount}条记录，剩余${finalSize}条`);
      }
    }
  }
  
  /**
   * 手动触发缓存垃圾回收（静态方法）
   * @param {boolean} force - 是否强制清理所有过期条目
   */
  static runGarbageCollection(force = false) {
    const cache = WebDAVClient._globalValidationCache;
    const now = Date.now();
    const expiredKeys = [];
    const beforeSize = cache.size;
    
    // 清理过期条目
    for (const [key, entry] of cache.entries()) {
      const age = now - entry.timestamp;
      if (force || age > WebDAVClient.CACHE_DURATION) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => cache.delete(key));
    
    const afterSize = cache.size;
    const cleanedCount = beforeSize - afterSize;
    
    console.log(`🧹 手动WebDAV缓存清理${force ? '(强制)' : ''}: 清理了${cleanedCount}条记录，剩余${afterSize}条`);
    
    return { cleaned: cleanedCount, remaining: afterSize };
  }
  
  /**
   * 获取缓存统计信息（静态方法）
   * @returns {Object} 缓存统计信息
   */
  static getCacheStats() {
    const cache = WebDAVClient._globalValidationCache;
    const now = Date.now();
    let expiredCount = 0;
    let validCount = 0;
    let oldestAge = 0;
    let newestAge = Infinity;
    
    for (const [, entry] of cache.entries()) {
      const age = now - entry.timestamp;
      if (age > WebDAVClient.CACHE_DURATION) {
        expiredCount++;
      } else {
        validCount++;
      }
      oldestAge = Math.max(oldestAge, age);
      newestAge = Math.min(newestAge, age);
    }
    
    return {
      totalEntries: cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      maxSize: WebDAVClient.MAX_CACHE_SIZE,
      cacheUsagePercent: ((cache.size / WebDAVClient.MAX_CACHE_SIZE) * 100).toFixed(1) + '%',
      oldestEntryAge: Math.floor(oldestAge / 1000) + '秒',
      newestEntryAge: newestAge === Infinity ? '无' : Math.floor(newestAge / 1000) + '秒',
      cacheDuration: WebDAVClient.CACHE_DURATION / (60 * 1000) + '分钟'
    };
  }
  
  /**
   * 生成配置哈希值，用于检测配置变化
   * @returns {string} 配置的哈希值
   */
  _getConfigHash() {
    return unicodeToBase64(`${this.url}:${this.username}:${this.password}`);
  }
  
  /**
   * 检查验证缓存是否有效
   * @returns {boolean} 如果缓存有效返回true
   */
  _isValidationCacheValid() {
    const cache = WebDAVClient._globalValidationCache.get(this._configHash);
    if (!cache) return false;
    
    // 检查缓存是否过期（30分钟）
    const cacheAge = Date.now() - cache.timestamp;
    if (cacheAge > WebDAVClient.CACHE_DURATION) {
      WebDAVClient._globalValidationCache.delete(this._configHash);
      return false;
    }
    
    return true;
  }
  
  /**
   * 获取验证缓存结果
   * @returns {Object|null} 缓存的验证结果
   */
  _getValidationCache() {
    const cache = WebDAVClient._globalValidationCache.get(this._configHash);
    if (cache) {
      // 更新最后访问时间
      cache.lastAccessed = Date.now();
      return cache.result;
    }
    return null;
  }
  
  /**
   * 设置验证缓存
   * @param {Object} result - 验证结果
   */
  _setValidationCache(result) {
    // 在设置新缓存前检查是否需要垃圾回收
    this._maybeRunGarbageCollection();
    
    WebDAVClient._globalValidationCache.set(this._configHash, {
      result: { ...result },
      timestamp: Date.now(),
      lastAccessed: Date.now() // 添加最后访问时间用于LRU
    });
  }
  
  /**
   * 清除验证缓存
   * 当配置变化时应该调用此方法
   */
  clearValidationCache() {
    WebDAVClient._globalValidationCache.delete(this._configHash);
    console.log('🧹 WebDAV 验证缓存已清除');
  }

  /**
   * 生成 HTTP Basic 认证头
   * @returns {Object} 包含 Authorization 头的对象，如果没有用户名密码则返回空对象
   */
  authHeader() {
    if (!this.username && !this.password) return {};
    // 使用 Base64 编码用户名:密码 组合（支持中文等 Unicode 字符）
    const token = unicodeToBase64(`${this.username}:${this.password}`);
    return { 'Authorization': `Basic ${token}` };
  }

  /**
   * 确保 WebDAV 服务器可访问
   * 首先尝试 PROPFIND 方法检测服务器，失败时回退到写入测试
   * @returns {Promise<boolean>} 服务器是否可访问
   * @throws {Error} 当未配置 WebDAV URL 时抛出错误
   */
  /**
   * 快速且严格的WebDAV验证
   * 1. 先验证URL格式
   * 2. 用HEAD请求快速检测服务器可达性
   * 3. 严格验证认证（401/403检查）
   * 4. 可选的写入权限测试
   * @param {boolean} testWrite - 是否测试写入权限
   * @returns {Promise<Object>} 验证结果 {success: boolean, error?: string, canWrite?: boolean}
   */
  async ensureBase(testWrite = false, forceValidation = false) {
    // 检查缓存是否有效，除非强制验证
    if (!forceValidation && this._isValidationCacheValid()) {
      console.log('🚀 WebDAV 使用验证缓存，跳过重复验证');
      return this._getValidationCache();
    }
    
    const timer = WebDAVLogger.time('WebDAV验证');
    
    try {
      if (!this.url) {
        throw new Error('未配置 WebDAV URL');
      }
      
      // 1. 验证URL格式
      try {
        new URL(this.url);
      } catch {
        throw new Error('URL格式无效');
      }
      
      // 2. 快速HEAD请求检测服务器可达性
      const headTimer = WebDAVLogger.time('HEAD请求');
      try {
        const headRes = await davFetch(this.url, {
          method: 'HEAD',
          headers: { ...this.authHeader() }
        });
        
        headTimer({ status: headRes.status });
        
        // 严格检查认证错误
        if (headRes.status === 401) {
          throw new Error('认证失败：用户名或密码错误');
        }
        if (headRes.status === 403) {
          throw new Error('权限拒绝：无访问权限');
        }
        if (headRes.status >= 400) {
          throw new Error(`服务器错误：${headRes.status} ${headRes.statusText}`);
        }
        
      } catch (e) {
        headTimer(null, e);
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
          throw new Error('网络错误：无法连接到服务器');
        }
        throw e;
      }
      
      // 3. 验证PROPFIND权限（更严格的WebDAV验证）
      const propfindTimer = WebDAVLogger.time('PROPFIND验证');
      try {
        const propfindRes = await davFetch(this.url, {
          method: 'PROPFIND',
          headers: {
            'Accept': '*/*',
            'Content-Type': 'application/xml; charset=utf-8',
            ...this.authHeader(),
            Depth: '1'
          }
        });
        
        propfindTimer({ status: propfindRes.status });
        
        if (propfindRes.status === 401) {
          throw new Error('WebDAV认证失败：用户名或密码错误');
        }
        if (propfindRes.status === 403) {
          throw new Error('WebDAV权限拒绝：无目录访问权限');
        }
        if (propfindRes.status >= 400 && propfindRes.status !== 405) {
          // 405 Method Not Allowed 可以接受，表示服务器支持但禁用了PROPFIND
          throw new Error(`WebDAV错误：${propfindRes.status}`);
        }
        
      } catch (e) {
        propfindTimer(null, e);
        // 如果是405错误，说明服务器可达但可能不支持PROPFIND，继续
        if (!e.message.includes('405')) {
          throw e;
        }
      }
      
      // 4. 可选的写入权限测试
      let canWrite = false;
      if (testWrite) {
        canWrite = await this.probeWrite();
      }
      
      const result = { success: true, canWrite };
      timer(result);
      
      // 缓存验证结果
      this._setValidationCache(result);
      
      return result;
      
    } catch (e) {
      timer(null, e);
      const errorResult = { success: false, error: e.message };
      
      // 验证失败时清除缓存
      this.clearValidationCache();
      
      return errorResult;
    }
  }

  /**
   * 专门的认证测试方法
   * 用于options页面的严格测试
   * @returns {Promise<Object>} 测试结果
   */
  async testAuthentication() {
    return this.ensureBase(true, true);  // 包含写入权限测试，强制验证
  }

  /**
   * 列举 WebDAV 目录中的文件
   * 只返回 .json 文件，按修改时间倒序排列
   * @returns {Promise<Array>} 文件列表，每个文件包含 name、lastmod、size 属性
   */
  async list() {
    const timer = WebDAVLogger.time('文件列表获取');
    
    try {
      // 构造 PROPFIND 请求体，获取文件的显示名、修改时间和大小
      const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getlastmodified/>
    <d:getcontentlength/>
  </d:prop>
</d:propfind>`;
      
      const fetchTimer = WebDAVLogger.time('PROPFIND 文件列表请求');
      
      try {
        // 发送 PROPFIND 请求获取目录列表
        const res = await davFetch(this.url, { 
          method: 'PROPFIND', 
          headers: { 
            'Accept': '*/*', 
            'Content-Type': 'application/xml; charset=utf-8', 
            ...this.authHeader(), 
            Depth: '1' // 只查询当前目录层级
          }, 
          body 
        });
        
        fetchTimer({ status: res.status });
        
        if (res.status >= 400) throw new Error(`列举失败: ${res.status}`);
        
        // 解析 XML 响应
        const parseTimer = WebDAVLogger.time('XML 解析');
        const text = await res.text();
        const entries = parsePropfind(text);
        parseTimer({ entriesCount: entries?.length || 0 });
        
        if (!entries || entries.length === 0) {
          timer({ count: 0 });
          return [];
        }
        
        // 处理文件条目
        const processTimer = WebDAVLogger.time('文件条目处理');
        
        // 识别目录自身的 href（通常是最短的那一条）
        // 这样可以过滤掉目录本身，只保留文件条目
        const sortedByHrefLen = [...entries].filter(e => e.href).sort((a,b) => (a.href.length||0) - (b.href.length||0));
        const baseHref = sortedByHrefLen[0]?.href || '';
        
        const items = entries
          .filter(it => (it.href || '') !== baseHref) // 过滤掉目录自身
          .map(it => {
            const href = decodeURIComponent(it.href || '');
            let name = '';
            
            // 提取文件名
            if (href && baseHref && href.startsWith(baseHref)) {
              name = href.slice(baseHref.length);
            } else {
              const parts = href.split('/').filter(Boolean);
              name = parts.pop() || '';
            }
            
            // 清理文件名，移除尾部斜杠
            name = name.replace(/\/$/, '');
            const lastmod = it.lastmod;
            const size = it.size;
            
            return { name, lastmod, size };
          })
          .filter(it => it.name && it.name.toLowerCase().endsWith('.json')) // 只保留 .json 文件
          .sort((a,b) => b.lastmod - a.lastmod); // 按修改时间倒序排列
        
        processTimer({ jsonFiles: items.length, totalEntries: entries.length });
        timer({ count: items.length });
        
        return items;
      } catch (e) {
        fetchTimer(null, e);
        // 无列举权限时回退为空列表，避免抛出错误
        console.log('📝 无列举权限，返回空列表');
        timer({ count: 0, fallback: true });
        return [];
      }
    } catch (e) {
      timer(null, e);
      return [];
    }
  }

  /**
   * 上传 JSON 对象到 WebDAV 服务器
   * @param {string} name - 文件名
   * @param {Object} obj - 要上传的 JSON 对象
   * @returns {Promise<boolean>} 上传成功返回 true
   * @throws {Error} 上传失败时抛出错误
   */
  async uploadJSON(name, obj) {
    const timer = WebDAVLogger.time(`文件上传 [${name}]`);
    
    try {
      // 构造完整的文件 URL，对文件名进行 URL 编码
      const url = this.url + encodeURIComponent(name);
      const jsonData = JSON.stringify(obj);
      const fileSize = new Blob([jsonData]).size;
      
      console.log(`📤 准备上传文件: ${name} (${fileSize} bytes)`);
      
      // 使用 PUT 方法上传文件
      const res = await davFetch(url, { 
        method: 'PUT', 
        headers: { 
          'Content-Type': 'application/json', 
          ...this.authHeader() 
        }, 
        body: jsonData // 将对象序列化为 JSON 字符串
      });
      
      if (res.status >= 400) {
        const error = new Error(`上传失败: ${res.status}`);
        timer(null, error);
        throw error;
      }
      
      timer({ fileName: name, fileSize, status: res.status });
      return true;
    } catch (e) {
      timer(null, e);
      throw e;
    }
  }

  /**
   * 从 WebDAV 服务器下载 JSON 文件
   * @param {string} name - 文件名
   * @returns {Promise<Object>} 解析后的 JSON 对象
   * @throws {Error} 下载失败时抛出错误
   */
  async downloadJSON(name) {
    const timer = WebDAVLogger.time(`文件下载 [${name}]`);
    
    try {
      // 构造完整的文件 URL，对文件名进行 URL 编码
      const url = this.url + encodeURIComponent(name);
      
      console.log(`📥 准备下载文件: ${name}`);
      
      // 使用 GET 方法下载文件
      const res = await davFetch(url, { 
        method: 'GET', 
        headers: { ...this.authHeader() } 
      });
      
      if (res.status >= 400) {
        const error = new Error(`下载失败: ${res.status}`);
        timer(null, error);
        throw error;
      }
      
      // 获取文件大小信息
      const contentLength = res.headers.get('content-length');
      const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
      
      const parseTimer = WebDAVLogger.time('JSON 解析');
      
      // 解析响应为 JSON 对象并返回
      const jsonData = await res.json();
      
      parseTimer({ objectKeys: Object.keys(jsonData).length });
      timer({ fileName: name, fileSize, status: res.status });
      
      return jsonData;
    } catch (e) {
      timer(null, e);
      throw e;
    }
  }

  /**
   * 从 WebDAV 服务器删除文件
   * @param {string} name - 要删除的文件名
   * @returns {Promise<boolean>} 删除成功返回 true
   * @throws {Error} 删除失败时抛出错误
   */
  async remove(name) {
    const timer = WebDAVLogger.time(`文件删除 [${name}]`);
    
    try {
      // 构造完整的文件 URL，对文件名进行 URL 编码
      const url = this.url + encodeURIComponent(name);
      
      console.log(`🗑️ 准备删除文件: ${name}`);
      
      // 使用 DELETE 方法删除文件
      const res = await davFetch(url, { 
        method: 'DELETE', 
        headers: { ...this.authHeader() } 
      });
      
      if (res.status >= 400) {
        const error = new Error(`删除失败: ${res.status}`);
        timer(null, error);
        throw error;
      }
      
      timer({ fileName: name, status: res.status });
      return true;
    } catch (e) {
      timer(null, e);
      throw e;
    }
  }

  /**
   * 通过写入探针文件测试 WebDAV 服务器的写权限
   * 创建一个临时文件，然后立即删除它
   * @returns {Promise<boolean>} 有写权限返回 true，否则返回 false
   */
  async probeWrite() {
    const timer = WebDAVLogger.time('写权限探测');
    
    try {
      // 生成唯一的探针文件名，避免冲突
      const testName = `.mytab_probe_${Date.now()}.json`;
      const url = this.url + encodeURIComponent(testName);
      const payload = { ts: Date.now() }; // 简单的测试数据
      
      console.log(`🔍 创建探针文件: ${testName}`);
      
      const putTimer = WebDAVLogger.time('探针文件上传');
      
      // 尝试上传探针文件
      const putRes = await davFetch(url, { 
        method: 'PUT', 
        headers: { 
          'Content-Type': 'application/json', 
          ...this.authHeader() 
        }, 
        body: JSON.stringify(payload) 
      });
      
      putTimer({ status: putRes.status });
      
      if (putRes.status >= 400) {
        timer({ hasWritePermission: false, reason: `PUT failed: ${putRes.status}` });
        return false;
      }
      
      // 删除探针文件（忽略删除失败，因为主要目的是测试写权限）
      const deleteTimer = WebDAVLogger.time('探针文件清理');
      try { 
        const deleteRes = await davFetch(url, { 
          method: 'DELETE', 
          headers: { ...this.authHeader() } 
        }); 
        deleteTimer({ status: deleteRes.status });
      } catch (e) {
        deleteTimer(null, e);
        console.log('⚠️ 探针文件清理失败，但不影响写权限测试结果');
      }
      
      timer({ hasWritePermission: true, probeFile: testName });
      return true;
    } catch (e) { 
      // 任何异常都表示没有写权限
      timer({ hasWritePermission: false, reason: e.message });
      return false; 
    }
  }
}

/**
 * 解析 PROPFIND 响应的 XML 内容
 * 在无 DOMParser 环境下使用正则表达式进行极简解析
 * @param {string} xmlText - PROPFIND 响应的 XML 文本
 * @returns {Array} 解析后的文件/目录信息数组
 */
function parsePropfind(xmlText) {
  try {
    // 提取所有 response 标签的内容
    const responses = splitTagsNS(xmlText, 'response');
    if (responses.length === 0) return [];
    
    // 解析每个 response 块
    return responses.map(chunk => {
      const href = getTagTextNS(chunk, 'href'); // 文件/目录的 URL 路径
      const displayname = getTagTextNS(chunk, 'displayname'); // 显示名称
      const last = getTagTextNS(chunk, 'getlastmodified'); // 最后修改时间
      const sizeStr = getTagTextNS(chunk, 'getcontentlength'); // 文件大小
      
      // 转换时间戳和文件大小
      const lastmod = new Date(last || Date.now()).getTime();
      const size = parseInt(sizeStr || '0', 10);
      
      return { href, name: displayname, displayname, lastmod, size };
    });
  } catch (e) {
    // 解析失败时返回空数组，避免抛出错误
    return [];
  }
}

/**
 * 从 XML 中提取指定标签的所有内容
 * 支持带命名空间前缀的标签（如 d:response）
 * @param {string} xml - XML 文本
 * @param {string} localTag - 要提取的标签名（不包含命名空间前缀）
 * @returns {Array<string>} 提取到的标签内容数组
 */
function splitTagsNS(xml, localTag) {
  // 构造正则表达式，匹配带或不带命名空间前缀的标签
  // 例如：<response> 或 <d:response>
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${localTag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${localTag}>`, 'gi');
  const out = [];
  let m;
  
  // 使用正则表达式全局匹配，提取所有匹配的标签内容
  while ((m = pattern.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/**
 * 从 XML 片段中提取指定标签的文本内容
 * 支持带命名空间前缀的标签
 * @param {string} xml - XML 片段
 * @param {string} localTag - 要提取的标签名（不包含命名空间前缀）
 * @returns {string} 标签的文本内容，如果未找到则返回空字符串
 */
function getTagTextNS(xml, localTag) {
  // 构造正则表达式匹配标签并提取内容
  const m = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${localTag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${localTag}>`, 'i').exec(xml);
  
  // 如果找到匹配，解码 HTML 实体并去除首尾空白
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

/**
 * 解码 HTML 实体字符
 * 将常见的 HTML 实体转换回原始字符
 * @param {string} str - 包含 HTML 实体的字符串
 * @returns {string} 解码后的字符串
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')    // &amp; -> &
    .replace(/&lt;/g, '<')     // &lt; -> <
    .replace(/&gt;/g, '>')     // &gt; -> >
    .replace(/&quot;/g, '"')   // &quot; -> "
    .replace(/&#39;/g, "'");   // &#39; -> '
}

/**
 * 将 Unicode 字符串转换为 Base64 编码
 * 支持中文等非 Latin1 字符
 * @param {string} str - 要编码的字符串
 * @returns {string} Base64 编码后的字符串
 */
function unicodeToBase64(str) {
  // 将字符串转换为 UTF-8 字节数组，然后转换为 Base64
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

/**
 * WebDAV 请求的 fetch 包装函数
 * 在网页模式下通过 Vercel 代理绕过 CORS 限制
 * 在扩展模式下直接连接到 WebDAV 服务器
 * @param {string} targetUrl - 目标 WebDAV URL
 * @param {Object} options - fetch 选项
 * @returns {Promise<Response>} fetch 响应
 */
function davFetch(targetUrl, options) {
  const method = options?.method || 'GET';
  const isProxy = typeof window !== 'undefined' && window.__MYTAB_USE_PROXY__;
  
  // 记录请求开始
  const requestTimer = WebDAVLogger.time(`HTTP ${method} ${isProxy ? '(代理)' : '(直连)'}`);
  
  try {
    // 检查是否在网页模式下且需要使用代理
    if (isProxy) {
      // 构造代理 API 端点
      const api = `/api/webdav?url=${encodeURIComponent(targetUrl)}`;
      const headers = { ...(options?.headers || {}) };
      
      // 特殊处理 PROPFIND 方法
      // 某些平台可能拦截 PROPFIND 请求，使用自定义头传递给代理
      if (options && options.method && options.method.toUpperCase() === 'PROPFIND') {
        headers['x-dav-method'] = 'PROPFIND'; // 通过自定义头传递真实方法
        const { method, ...rest } = options;
        // 将 PROPFIND 转换为 POST 请求发送给代理
        return fetch(api, { method: 'POST', ...rest, headers })
          .then(res => {
            requestTimer({ status: res.status, mode: 'proxy', originalMethod: 'PROPFIND' });
            return res;
          })
          .catch(err => {
            requestTimer(null, err);
            throw err;
          });
      }
      
      // 其他方法直接通过代理转发
      return fetch(api, { ...options, headers })
        .then(res => {
          requestTimer({ status: res.status, mode: 'proxy' });
          return res;
        })
        .catch(err => {
          requestTimer(null, err);
          throw err;
        });
    }
  } catch (e) {
    // 代理模式失败时静默忽略，回退到直连模式
    console.log('⚠️ 代理模式失败，回退到直连模式');
  }
  
  // 扩展模式或代理失败时，直接连接到目标 URL
  // 在Chrome扩展环境中，添加额外的选项来处理CORS
  const fetchOptions = {
    ...options,
    // 确保在扩展环境中不检查CORS（Chrome扩展有自己的权限系统）
    mode: 'cors',
    credentials: 'omit' // 不发送cookies，避免额外的CORS问题
  };
  
  // 如果有自定义headers，确保它们被正确设置
  if (options?.headers) {
    fetchOptions.headers = {
      ...options.headers
    };
  }
  
  return fetch(targetUrl, fetchOptions)
    .then(res => {
      requestTimer({ status: res.status, mode: 'direct' });
      return res;
    })
    .catch(err => {
      requestTimer(null, err);
      // 提供更详细的错误信息
      if (err.message.includes('Failed to fetch')) {
        const enhancedError = new Error(
          `无法连接到WebDAV服务器: ${targetUrl}\n` +
          `请确保：\n` +
          `1. URL地址正确\n` +
          `2. 服务器正在运行\n` +
          `3. 用户名密码正确\n` +
          `原始错误: ${err.message}`
        );
        throw enhancedError;
      }
      throw err;
    });
}
