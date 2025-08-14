// 轻量 WebDAV 客户端，基于 fetch

export class WebDAVClient {
  constructor(config) {
    this.url = (config?.url || '').replace(/\/*$/, '/');
    this.username = config?.username || '';
    this.password = config?.password || '';
    this.basePath = '';
  }

  authHeader() {
    if (!this.username && !this.password) return {};
    const token = btoa(`${this.username}:${this.password}`);
    return { 'Authorization': `Basic ${token}` };
  }

  async ensureBase() {
    if (!this.url) throw new Error('未配置 WebDAV URL');
    // 使用带 body 的 PROPFIND，更兼容部分实现
    const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
  </d:prop>
</d:propfind>`;
    const res = await davFetch(this.url, { method: 'PROPFIND', headers: { 'Content-Type': 'application/xml; charset=utf-8', ...this.authHeader(), Depth: '1' }, body });
    if (res.status >= 400) throw new Error(`连接失败: ${res.status}`);
    return true;
  }

  async list() {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getlastmodified/>
    <d:getcontentlength/>
  </d:prop>
</d:propfind>`;
    const res = await davFetch(this.url, { method: 'PROPFIND', headers: { 'Content-Type': 'application/xml; charset=utf-8', ...this.authHeader(), Depth: '1' }, body });
    if (res.status >= 400) throw new Error(`列举失败: ${res.status}`);
    const text = await res.text();
    const entries = parsePropfind(text);
    if (!entries || entries.length === 0) return [];
    // 识别目录自身的 href（通常是最短的那一条）
    const sortedByHrefLen = [...entries].filter(e => e.href).sort((a,b) => (a.href.length||0) - (b.href.length||0));
    const baseHref = sortedByHrefLen[0]?.href || '';
    const items = entries
      .filter(it => (it.href || '') !== baseHref)
      .map(it => {
        const href = decodeURIComponent(it.href || '');
        let name = '';
        if (href && baseHref && href.startsWith(baseHref)) {
          name = href.slice(baseHref.length);
        } else {
          const parts = href.split('/').filter(Boolean);
          name = parts.pop() || '';
        }
        name = name.replace(/\/$/, '');
        const lastmod = it.lastmod;
        const size = it.size;
        return { name, lastmod, size };
      })
      .filter(it => it.name && it.name.toLowerCase().endsWith('.json'))
      .sort((a,b) => b.lastmod - a.lastmod);
    return items;
  }

  async uploadJSON(name, obj) {
    const url = this.url + encodeURIComponent(name);
    const res = await davFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...this.authHeader() }, body: JSON.stringify(obj) });
    if (res.status >= 400) throw new Error(`上传失败: ${res.status}`);
    return true;
  }

  async downloadJSON(name) {
    const url = this.url + encodeURIComponent(name);
    const res = await davFetch(url, { method: 'GET', headers: { ...this.authHeader() } });
    if (res.status >= 400) throw new Error(`下载失败: ${res.status}`);
    return await res.json();
  }

  async remove(name) {
    const url = this.url + encodeURIComponent(name);
    const res = await davFetch(url, { method: 'DELETE', headers: { ...this.authHeader() } });
    if (res.status >= 400) throw new Error(`删除失败: ${res.status}`);
    return true;
  }
}

// 无 DOMParser 环境下的极简 PROPFIND 响应解析
function parsePropfind(xmlText) {
  try {
    const responses = splitTagsNS(xmlText, 'response');
    if (responses.length === 0) return [];
    return responses.map(chunk => {
      const href = getTagTextNS(chunk, 'href');
      const displayname = getTagTextNS(chunk, 'displayname');
      const last = getTagTextNS(chunk, 'getlastmodified');
      const sizeStr = getTagTextNS(chunk, 'getcontentlength');
      const lastmod = new Date(last || Date.now()).getTime();
      const size = parseInt(sizeStr || '0', 10);
      return { href, name: displayname, displayname, lastmod, size };
    });
  } catch (e) {
    return [];
  }
}

function splitTagsNS(xml, localTag) {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${localTag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${localTag}>`, 'gi');
  const out = [];
  let m;
  while ((m = pattern.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function getTagTextNS(xml, localTag) {
  const m = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${localTag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${localTag}>`, 'i').exec(xml);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 在网页模式下通过 Vercel 代理绕过 CORS；扩展模式直连
function davFetch(targetUrl, options) {
  try {
    if (typeof window !== 'undefined' && window.__MYTAB_USE_PROXY__) {
      const api = `/api/webdav?url=${encodeURIComponent(targetUrl)}`;
      const headers = { ...(options?.headers || {}) };
      // 平台可能拦截 PROPFIND，这里用自定义头传给代理再覆盖 method
      if (options && options.method && options.method.toUpperCase() === 'PROPFIND') {
        headers['x-dav-method'] = 'PROPFIND';
      }
      return fetch(api, { ...options, headers });
    }
  } catch (e) {}
  return fetch(targetUrl, options);
}
