/**
 * 图标获取工具模块
 * 统一的favicon获取逻辑，供不同环境使用
 */

/**
 * 获取备选图标服务列表
 * @param {string} domain - 域名
 * @param {string} pageUrl - 完整页面URL
 * @returns {string[]} 备选图标URL数组
 */
export function getFallbackIconServices(domain, pageUrl) {
  return [
    // 国外服务
    `https://www.google.com/s2/favicons?sz=64&domain=${domain}`,
    `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(pageUrl)}`,
    
    // 大陆可用的备选服务
    `https://api.iowen.cn/favicon/${domain}.png`,                    // iowen图标服务（国内）
    `https://favicon.yandex.net/favicon/v2/${domain}?size=64`,       // Yandex图标服务（俄罗斯，大陆可访问）
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,               // DuckDuckGo图标服务（隐私友好）
    `https://www.faviconextractor.com/favicon/${domain}`,           // FaviconExtractor服务
    
    // 通用备选方案
    `https://via.placeholder.com/64x64/4f46e5/ffffff?text=${domain.charAt(0).toUpperCase()}` // 占位符图标（最后兜底）
  ];
}

/**
 * 获取标准图标路径
 * @param {string} origin - 网站源地址
 * @returns {string[]} 标准图标路径数组
 */
export function getStandardIconPaths(origin) {
  return [
    '/favicon.ico',                    // 标准favicon
    '/favicon.png',                    // PNG格式favicon
    '/apple-touch-icon.png',           // Apple触摸图标
    '/apple-touch-icon-precomposed.png', // Apple预合成图标
    '/favicon-32x32.png',
    '/favicon-16x16.png',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png'
  ].map(p => origin + p);
}

/**
 * 将相对路径转换为绝对路径
 * @param {string} href - 相对或绝对路径
 * @param {URL} baseUrl - 基础URL对象
 * @returns {string} 绝对路径
 */
export function resolveIconUrl(href, baseUrl) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;  // 已经是绝对路径
  if (href.startsWith('//')) return baseUrl.protocol + href;  // 协议相对路径
  if (href.startsWith('/')) return baseUrl.origin + href;  // 根相对路径
  return baseUrl.origin + '/' + href.replace(/^\./, '');  // 相对当前目录
}

/**
 * 从HTML中提取图标链接
 * @param {string} html - HTML内容
 * @param {URL} baseUrl - 基础URL对象
 * @returns {string[]} 提取到的图标URL数组
 */
export function extractIconsFromHtml(html, baseUrl) {
  const icons = new Set();
  
  // 解析<link>标签中的图标声明
  const linkRe = /<link[^>]+>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() || '';
    
    // 过滤图标相关的rel属性
    if (!/(icon|shortcut icon|apple-touch-icon)/.test(rel)) continue;
    
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) {
      icons.add(resolveIconUrl(href, baseUrl));
    }
  }
  
  // 解析Open Graph图片（通常用作图标备选）
  const og = /<meta[^>]+property=["']og:image["'][^>]*>/gi;
  let m2;
  while ((m2 = og.exec(html)) !== null) {
    const tag = m2[0];
    const content = /content=["']([^"']+)["']/i.exec(tag)?.[1];
    if (content) {
      icons.add(resolveIconUrl(content, baseUrl));
    }
  }
  
  // 解析页面中的logo图片
  const logoRe = /<img[^>]+src=["']([^"']+logo[^"']+)["']/gi;
  let m3;
  while ((m3 = logoRe.exec(html)) !== null) {
    icons.add(resolveIconUrl(m3[1], baseUrl));
  }
  
  return [...icons];
}

/**
 * 通用的图标收集逻辑
 * @param {string} pageUrl - 页面URL
 * @param {Function} fetchFn - 自定义的fetch函数
 * @param {Function} validateFn - 图标验证函数（可选）
 * @returns {Promise<string[]>} 图标URL数组
 */
export async function collectFavicons(pageUrl, fetchFn = fetch, validateFn = null) {
  try {
    const u = new URL(pageUrl);
    const origin = u.origin;
    const domain = u.hostname;
    
    // 收集所有可能的图标URL
    const icons = new Set();
    
    // 第一步：添加标准图标路径
    getStandardIconPaths(origin).forEach(url => icons.add(url));
    
    try {
      // 第二步：从HTML页面中提取图标声明
      const html = await fetchFn(pageUrl, { method: 'GET' }).then(r => r.text());
      const htmlIcons = extractIconsFromHtml(html, u);
      htmlIcons.forEach(url => icons.add(url));
    } catch (e) {
      console.warn('获取页面HTML失败，使用标准图标路径', e);
    }
    
    // 第三步：验证图标有效性（如果提供了验证函数）
    let validIcons = [...icons];
    if (validateFn) {
      const checks = await Promise.all([...icons].map(validateFn));
      validIcons = checks.filter(Boolean);
    }
    
    // 第四步：添加备选服务
    const fallbackIcons = getFallbackIconServices(domain, pageUrl);
    
    // 合并所有图标URL并去重，按优先级排序
    return [...new Set([
      ...validIcons,      // 验证有效的图标
      ...fallbackIcons    // 备选图标服务
    ])];
    
  } catch (e) {
    console.warn('图标收集失败:', e);
    return [];
  }
}