// Vercel Serverless Function: 图标获取代理，解决Web版CORS限制
// 为Web版本提供图标base64转换服务

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing url parameter' });
      return;
    }

    // 转发到mt.agnet.top服务
    const response = await fetch('https://mt.agnet.top/image/url-to-base64', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: url })
    });

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      res.status(response.status).json({ 
        ok: false, 
        error: 'External service error',
        status: response.status 
      });
    }
  } catch (e) {
    console.error('Favicon proxy error:', e);
    res.status(502).json({ 
      ok: false, 
      error: 'Proxy error: ' + (e?.message || String(e))
    });
  }
}