# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此仓库代码时提供指导。

## 项目概述

MyTab 是一个 Chrome 浏览器扩展，提供可定制的新标签页，支持基于 WebDAV 的书签同步。它具有简洁现代的界面，用于将书签组织到文件夹和子文件夹中，并具有云备份功能以防止数据丢失。
为了方便用户在不支持扩展的设备上使用，MyTab还支持通过vercel部署Web版，其功能虽然不如浏览器扩展全面，但基本功能是完善的。
MyTab的所有样式属性均兼容移动端。

## 架构

### 核心组件

- **Chrome 扩展**: 位于 `mytab/` 目录
  - `manifest.json`: 扩展配置，包含权限和内容脚本
  - `index.html`: 主要新标签页界面
  - `options.html`: WebDAV 配置的设置页面
  - `background/service_worker.js`: 用于同步、备份和 API 处理的后台服务

### 关键脚本和模块

- **前端核心** (`mytab/scripts/`):
  - `app.js`: 主应用逻辑、UI 事件处理和状态管理
  - `storage.js`: Chrome 本地存储的数据层，包含书签/文件夹 CRUD 操作
  - `webdav.js`: 用于云同步的 WebDAV 客户端实现
  - `webdav-sync.js`: 扩展和 Web 版本之间的共享同步逻辑
  - `favicon-utils.js`: 网站图标收集和验证工具
  - `options.js`: WebDAV 配置的设置页面逻辑
  - `enhanced-bookmark-importer.js`: 增强书签导入器核心类，支持批量处理和并发控制
  - `enhancement-utils.js`: 书签增强工具类，包括信号量和进度跟踪器
  - `progress-dialog.js`: 进度显示对话框组件，用于实时显示导入进度
  - `web-shim.js`: Web环境兼容层，提供跨平台支持

- **API 层** (`api/`):
  - `webdav.js`: Vercel 无服务器函数，作为 Web 版本的 CORS 代理

### 数据结构

扩展在 Chrome 本地存储中存储两个主要对象：
- `data`: 包含文件夹、书签、背景图片设置和 lastModified 时间戳
- `settings`: WebDAV 配置、备份设置和主题首选项

书签按层次结构组织：
```
folders[] -> children[] -> bookmarks[]
```
其中children[]可以无限层级嵌套。

## 开发命令

这是一个纯客户端 Chrome 扩展，无需构建过程。开发工作流：

### 测试扩展
1. 打开 Chrome 并导航到 `chrome://extensions/`
2. 启用“开发者模式”
3. 点击“加载已解压的扩展程序”并选择 `mytab/` 目录
4. 扩展将覆盖您的新标签页

### 加载更改
- 修改任何文件后，在 `chrome://extensions/` 中点击扩展卡片上的刷新按钮
- 无需构建步骤 - 更改立即生效

### 测试 WebDAV 集成
- 通过扩展的选项页配置 WebDAV 设置
- 使用任何兼容 WebDAV 的服务进行测试（Nextcloud、ownCloud、通用 WebDAV 服务器）
- 备份文件以 JSON 格式存储，并带有时间戳文件名

## 架构模式

### Service Worker 通信
后台 Service Worker 处理：
- 可配置计划的自动云备份
- WebDAV 连接测试和文件操作
- 书签图标的网站图标获取
- 跨标签页数据同步

### 拖放系统
实现全面的拖放功能：
- 在容器内重新排序书签
- 在文件夹和子文件夹之间移动书签
- 在父文件夹之间移动子文件夹
- 支持拖拽移入功能，优化了拖拽样式和交互体验

### 图标管理
双重图标系统支持：
- **网站图标模式**: 自动获取和缓存网站网站图标
- **单色模式**: 单字母彩色图标，带有自动备用方案

### Enhanced Bookmark Import System
先进的书签批量导入功能：
- **并发控制**: 使用信号量限制同时处理的请求数量，避免浏览器卡顿
- **动态并发调整**: 根据网络状况和失败率自动调整并发数
- **进度显示**: 实时显示导入进度、成功率和当前处理的URL
- **智能标题获取**: 多种方法获取网页真实标题，包括元数据解析
- **错误处理**: 完善的错误处理和重试机制
- **用户交互**: 支持取消操作和实时进度反馈

### 云同步
- 由用户操作触发的防抖动自动备份
- 通过 Chrome 闹钟 API 进行定时备份
- 通过时间戳比较进行冲突检测和解决
- 在同步前自动进行本地备份的安全恢复

## WebDAV 集成

扩展支持任何兼容 WebDAV 的服务器进行云备份。配置包括：
- 服务器 URL、用户名和密码
- 备份频率（最小 15 分钟）
- 最大存储快照数量

备份文件使用时间戳命名：`{prefix}_{yyMMdd_HHmmss_sss}.json`

## Web 兼容性

Web 版本可以部署到 Vercel 等平台，共享核心逻辑：
- `api/webdav.js` 作为 WebDAV 操作的 CORS 代理
- `vercel.json` 处理 Web 部署的路由
- `scripts/` 中的共享模块在扩展和 Web 环境中都可以工作

## 安全考虑

- WebDAV 凭据存储在 Chrome 的本地存储中（不同步）
- CORS 代理验证并仅转发 WebDAV 特定的头部
- 在 WebDAV 操作之外不记录或传输敏感数据
- 自动数据验证防止同步过程中的数据损坏

## 常见开发任务

### 添加新的书签功能
- 在 `storage.js` DEFAULT_DATA 中修改书签数据结构
- 在 `storage.js` 中更新 CRUD 操作
- 在 `app.js` 书签渲染函数中添加 UI 处理

### 使用增强书签导入功能
- 核心类在 `enhanced-bookmark-importer.js`，提供完整的批量导入能力
- 工具类在 `enhancement-utils.js`，包括 `Semaphore` 和 `ProgressTracker`
- UI组件在 `progress-dialog.js`，提供进度显示对话框
- 在 `app.js` 中集成导入器，处理用户交互和状态管理

### 扩展 WebDAV 功能
- 核心 WebDAV 操作在 `mytab/scripts/webdav.js` 中
- 共享同步逻辑在 `webdav-sync.js` 中，用于跨平台兼容
- 后台操作在 `service_worker.js` 中处理

### UI 修改
- 样式在 `mytab/styles.css` 中
- HTML 模板嵌入在 `index.html` 中
- 动态渲染逻辑在 `app.js` 中

