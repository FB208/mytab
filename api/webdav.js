// Vercel Serverless Function: WebDAV 反向代理，解决浏览器端 CORS 限制
// 仅服务于“网页模式”，扩展模式不会使用到该代理

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,PROPFIND,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Depth, Destination, Overwrite, If-Modified-Since, If-None-Match, If-Match, Range, x-dav-method');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const target = req.query?.url;
  if (!target || typeof target !== 'string') {
    res.status(400).json({ ok: false, error: 'Missing url' });
    return;
  }

  try {
    // Collect raw body if any
    let body = undefined;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      body = await new Promise((resolve, reject) => {
        try {
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => resolve(Buffer.concat(chunks)));
          req.on('error', reject);
        } catch (e) { reject(e); }
      });
    }

    // Forward headers (whitelist)
    const forwardHeaders = {};
    const pick = [
      'authorization', 'content-type', 'depth', 'destination', 'overwrite',
      'if-modified-since', 'if-none-match', 'if-match', 'range'
    ];
    for (const key of pick) {
      const v = req.headers[key];
      if (v !== undefined) forwardHeaders[key] = v;
    }

    // Allow method override via x-dav-method (to bypass platforms blocking PROPFIND)
    const override = (req.headers['x-dav-method'] || '').toString().toUpperCase();
    // 若前端为绕过平台限制而把 PROPFIND 包装成 POST，这里改回真实方法
    const method = override || req.method;

    const upstream = await fetch(target, {
      method,
      headers: forwardHeaders,
      body
    });

    // Mirror status and content-type
    const buf = Buffer.from(await upstream.arrayBuffer());
    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    res.status(upstream.status);
    res.setHeader('Content-Type', ct);
    // Re-apply CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,PROPFIND,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Depth, Destination, Overwrite, If-Modified-Since, If-None-Match, If-Match, Range, x-dav-method');
    res.send(buf);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}

