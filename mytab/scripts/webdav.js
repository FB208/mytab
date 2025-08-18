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
  }

  /**
   * 生成 HTTP Basic 认证头
   * @returns {Object} 包含 Authorization 头的对象，如果没有用户名密码则返回空对象
   */
  authHeader() {
    if (!this.username && !this.password) return {};
    // 使用 Base64 编码用户名:密码 组合
    const token = btoa(`${this.username}:${this.password}`);
    return { 'Authorization': `Basic ${token}` };
  }

  /**
   * 确保 WebDAV 服务器可访问
   * 首先尝试 PROPFIND 方法检测服务器，失败时回退到写入测试
   * @returns {Promise<boolean>} 服务器是否可访问
   * @throws {Error} 当未配置 WebDAV URL 时抛出错误
   */
  async ensureBase() {
    const timer = WebDAVLogger.time('服务器连接检测');
    
    try {
      if (!this.url) throw new Error('未配置 WebDAV URL');
      
      // 构造 PROPFIND 请求的 XML 体，用于获取目录属性
      // 使用带 body 的 PROPFIND，提高与各种 WebDAV 实现的兼容性
      const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
  </d:prop>
</d:propfind>`;
      
      const propfindTimer = WebDAVLogger.time('PROPFIND 请求');
      
      try {
        // 发送 PROPFIND 请求检测服务器可用性
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
        
        propfindTimer({ status: res.status });
        
        if (res.status < 400) {
          timer({ method: 'PROPFIND', success: true });
          return true;
        }
        
        // 若 PROPFIND 不被允许，回退到写入探针文件测试写权限
        console.log('🔄 PROPFIND 失败，回退到写入测试...');
        const result = await this.probeWrite();
        timer({ method: 'probeWrite', success: result });
        return result;
      } catch (e) {
        propfindTimer(null, e);
        // 网络错误或其他异常时，回退到写入探针文件测试写权限
        console.log('🔄 PROPFIND 异常，回退到写入测试...');
        const result = await this.probeWrite();
        timer({ method: 'probeWrite', success: result });
        return result;
      }
    } catch (e) {
      timer(null, e);
      throw e;
    }
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
  return fetch(targetUrl, options)
    .then(res => {
      requestTimer({ status: res.status, mode: 'direct' });
      return res;
    })
    .catch(err => {
      requestTimer(null, err);
      throw err;
    });
}
