# GEMINI Project Context: MyTab

这个文件为gemini提供在此代码库中工作的指导。
你始终使用中文和用户沟通。

## 项目概览

MyTab 是一个 Chrome 浏览器扩展，同时支持以 Web 应用形式部署。它通过自定义 WebDAV 服务器存储和同步书签数据，提供历史备份功能，确保书签永不丢失。

项目采用原生 HTML/CSS/JavaScript（ES 模块）构建，无外部框架依赖，遵循快速、轻量级的原则。

## 项目架构

### 双模式运行架构
- **浏览器扩展模式**：使用 `chrome.storage` 和原生 Chrome API
- **Web 应用模式**：通过 `web-shim.js` 兼容层将 Chrome API 映射到 Web API（localStorage），使用 Vercel 无服务器函数作为 CORS 代理

### 核心模块结构
- **数据层** (`storage.js`)：统一的数据抽象层，管理所有 CRUD 操作
- **UI 层** (`app.js`)：主界面逻辑，状态管理和事件处理
- **背景服务** (`service_worker.js`)：定时备份、图标收集、消息路由
- **同步模块** (`webdav-sync.js`)：WebDAV 云端同步的核心逻辑
- **兼容性层** (`web-shim.js`)：Chrome API 到 Web API 的适配

### 数据结构
```javascript
// 主要数据结构
{
  folders: [
    {
      id: "f_xxx",
      name: "文件夹名",
      bookmarks: [...],
      subfolders: [...]
    }
  ],
  backgroundImage: "url",
  lastModified: timestamp
}
```

## 开发和部署命令

### 作为浏览器扩展运行
1. 打开 Chrome/Edge 扩展管理页面 (`chrome://extensions`)
2. 启用开发者模式
3. 点击"加载已解压的扩展程序"
4. 选择 `mytab/` 目录

### 作为 Web 应用运行
- **本地运行**：直接在浏览器中打开 `mytab/index.html`
- **Vercel 部署**：项目已配置 `vercel.json`，可直接部署到 Vercel

### 测试和调试
- **扩展调试**：使用 Chrome 开发者工具检查扩展页面
- **Web 版调试**：标准浏览器开发者工具
- **服务工作线程调试**：`chrome://extensions` → 详细信息 → 检查视图 → 服务工作线程

## 主要文件说明

### 关键入口文件
- `mytab/index.html` - 主界面（新标签页）
- `mytab/options.html` - 设置页面
- `mytab/manifest.json` - 扩展清单文件

### JavaScript 模块
- `scripts/app.js` - 主应用逻辑和 UI 渲染
- `scripts/storage.js` - 数据层，所有存储操作的统一接口
- `scripts/webdav-sync.js` - WebDAV 同步功能的核心实现
- `scripts/webdav.js` - WebDAV 客户端实现
- `scripts/web-shim.js` - Chrome API 兼容性垫片
- `background/service_worker.js` - 后台服务工作线程

### 部署文件
- `api/webdav.js` - Vercel 无服务器函数，WebDAV CORS 代理
- `vercel.json` - Vercel 部署配置

## 开发注意事项

### 兼容性设计原则
- 所有新功能都必须同时兼容扩展模式和 Web 模式
- 使用 `web-shim.js` 确保 Chrome API 调用在 Web 环境下正常工作
- WebDAV 请求在 Web 模式下通过 `api/webdav.js` 代理执行

### 数据流设计
- 所有数据操作必须通过 `storage.js` 进行，不要直接操作存储
- 数据变化时自动广播 `data:changed` 消息触发 UI 更新
- 长时间操作（如 WebDAV 同步）通过 `chrome.runtime.sendMessage` 委托给后台服务

### 文件组织规则
- UI 逻辑放在 `scripts/app.js`
- 数据操作放在 `scripts/storage.js`
- WebDAV 相关功能放在 `scripts/webdav-sync.js` 和 `scripts/webdav.js`
- 后台任务放在 `background/service_worker.js`

### 性能优化要点
- 图标获取使用防抖机制，避免频繁请求
- 备份操作使用防抖调度器，合并频繁操作
- 大量数据操作时提供加载状态反馈

## 常见开发任务

### 添加新的书签操作
1. 在 `storage.js` 中添加对应的数据操作函数
2. 在 `app.js` 中添加 UI 事件处理
3. 调用 `recordHandleBackup()` 触发自动备份

### 修改 WebDAV 同步逻辑
1. 编辑 `webdav-sync.js` 中的共享函数
2. 在 `service_worker.js` 中调用对应函数
3. 确保 Web 模式通过 `api/webdav.js` 正确代理

### 调试同步问题
- 检查浏览器控制台中的 WebDAV 请求日志
- 查看 `chrome://extensions` 中服务工作线程的日志
- 使用 `chrome://inspect/#service-workers` 调试后台逻辑

### 添加新的 UI 组件
1. 在 `index.html` 中添加对应的模板（`<template>`）
2. 在 `styles.css` 中添加样式
3. 在 `app.js` 中添加渲染和事件处理逻辑

## 项目特色功能

### 拖拽系统
支持书签和子文件夹的跨文件夹拖拽移动，使用全局 `dragState` 跟踪拖拽状态。

### 双图标系统
书签支持 favicon 和单色图标两种显示模式，用户可自定义选择。

### 云端同步机制
- 基于文件名时间戳的精确同步判断
- 支持多格式时间戳解析（新旧格式兼容）
- 同步前自动创建安全备份

### 自动备份策略
- 定时备份（可配置间隔，最小 15 分钟）
- 操作触发的防抖备份（4 秒延迟）
- 手动备份
- 同步前安全备份

