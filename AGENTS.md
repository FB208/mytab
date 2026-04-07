# MyTab Agent Notes

## 先看哪里
- `mytab/manifest.json`: 扩展真实根目录和权限来源；发布前版本号在这里改，不在仓库根目录。
- `mytab/index.html` -> `scripts/app.js`: 新标签页入口。
- `mytab/options.html` -> `scripts/options.js`: 设置页、WebDAV 配置、浏览器书签导入入口。
- `mytab/background/service_worker.js`: 备份、云同步、favicon/标题抓取、消息路由。
- `api/webdav.js` 和 `api/favicon.js`: 只给网页模式用的 Vercel 代理。

## 仓库边界
- 这不是 Node 项目：仓库里没有 `package.json`、锁文件、CI 或本地测试脚本；不要猜 `npm test`、`npm run build` 之类命令。
- 真正要加载到浏览器的是 `mytab/`，不是仓库根目录。
- `vercel.json` 只做重定向：`/` -> `/mytab/index.html`，`/options` -> `/mytab/options.html`。

## 运行与验证
- 扩展验证：在 Chromium/Chrome/Edge 的扩展开发者模式里“加载已解压的扩展程序”，选择 `mytab/`。
- 修改后没有构建步骤；刷新扩展即可生效，`service_worker.js` 也需要在扩展页重新加载后才会拿到新代码。
- 这个仓库最可靠的验证方式是手动走页面流程，不是命令行测试。

## 关键实现事实
- 数据主存储在 `chrome.storage.local`，核心结构在 `mytab/scripts/storage.js`：
  - `data = { folders, backgroundImage, lastModified }`
  - `settings = { webdav, backup, client, theme }`
- 文件夹是无限层级树，不是两层结构；改书签/文件夹模型时先看 `DEFAULT_DATA`、`ensureInit()` 和相关 CRUD。
- 首页启动链路是 `app.js` 顶层 `await ensureInit(); await bootstrap();`，然后延迟 1 秒执行云端检查；不要在初始化阶段随意改顺序。
- 后台自动备份不是只靠定时器：`service_worker.js` 还会在 `chrome.storage` 的 `data` 变化后做 4 秒防抖备份。

## 扩展模式 vs 网页模式
- `scripts/web-shim.js` 只在非扩展环境下注入 `chrome` 兼容层，并设置 `window.__MYTAB_USE_PROXY__ = true`。
- WebDAV 请求在网页模式下会经 `scripts/webdav.js` 走 `/api/webdav?url=...` 代理；`PROPFIND` 会被包装成 `POST + x-dav-method`。
- 扩展模式下直接请求 WebDAV，依赖 manifest 权限和设置页里的 `chrome.permissions.request()`。
- 代码里有对 `https://mt.agnet.top/*` 的外部依赖：
  - `manifest.json` 的固定 `host_permissions`
  - 标题/图标增强和图片转 base64 的远程接口

## 改动时的注意点
- 保存 WebDAV 配置的逻辑不只是写存储；`options.js` 还会申请/检查站点权限并清理 WebDAV 验证缓存。
- 书签导入主入口在 `options.js`，增强导入实现分散在 `enhanced-bookmark-importer.js`、`enhancement-utils.js`、`progress-dialog.js`。
- 仓库的 VS Code 设置明确关闭了 format-on-save 和 fixAll-on-save；不要假设存在统一自动格式化步骤。

## 现有说明文件
- `CLAUDE.md` 有较完整中文背景说明，但部分内容比代码更概括；遇到冲突以 `manifest.json`、HTML 入口、脚本实现为准。
