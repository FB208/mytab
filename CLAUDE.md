# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 全局规则
你始终使用中文和用户沟通。
你不要删除用户自己添加的注释，写清注释是很好的习惯。
除非用户主动要求，否则你不修改README.md

## Project Overview

MyTab is a Chrome browser extension that provides a customizable new tab page with WebDAV-based bookmark synchronization. It features a clean, modern interface for organizing bookmarks into folders and subfolders, with cloud backup capabilities to prevent data loss.

## Architecture

### Core Components

- **Chrome Extension**: Located in `mytab/` directory
  - `manifest.json`: Extension configuration with permissions and content scripts
  - `index.html`: Main new tab page interface
  - `options.html`: Settings page for WebDAV configuration
  - `background/service_worker.js`: Background service for sync, backups, and API handling

### Key Scripts and Modules

- **Frontend Core** (`mytab/scripts/`):
  - `app.js`: Main application logic, UI event handling, and state management
  - `storage.js`: Data layer for Chrome local storage with bookmark/folder CRUD operations
  - `webdav.js`: WebDAV client implementation for cloud synchronization
  - `webdav-sync.js`: Shared sync logic between extension and web versions
  - `favicon-utils.js`: Favicon collection and validation utilities
  - `options.js`: Settings page logic for WebDAV configuration

- **API Layer** (`api/`):
  - `webdav.js`: Vercel serverless function acting as CORS proxy for web version

### Data Structure

The extension stores two main objects in Chrome local storage:
- `data`: Contains folders, bookmarks, background image settings, and lastModified timestamp
- `settings`: WebDAV configuration, backup settings, and theme preferences

Bookmarks are organized in a hierarchical structure:
```
folders[] -> subfolders[] -> bookmarks[]
```

Each bookmark supports both favicon and mono-colored icon modes with drag-and-drop reordering.

## Development Commands

This is a pure client-side Chrome extension with no build process. Development workflow:

### Testing the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `mytab/` directory
4. The extension will override your new tab page

### Loading Changes
- After modifying any files, click the refresh button on the extension card in `chrome://extensions/`
- No build step required - changes are reflected immediately

### Testing WebDAV Integration
- Configure WebDAV settings through the extension's options page
- Test with any WebDAV-compatible service (Nextcloud, ownCloud, generic WebDAV servers)
- Backup files are stored as JSON with timestamped filenames

## Architecture Patterns

### Service Worker Communication
The background service worker handles:
- Automatic cloud backups on a configurable schedule
- WebDAV connectivity testing and file operations
- Favicon fetching for bookmark icons
- Cross-tab data synchronization

### Drag and Drop System
Implements comprehensive drag-and-drop for:
- Reordering bookmarks within containers
- Moving bookmarks between folders and subfolders
- Moving subfolders between parent folders

### Icon Management
Dual icon system supporting:
- **Favicon mode**: Automatically fetches and caches website favicons
- **Mono mode**: Single-letter colored icons with automatic fallback

### Cloud Synchronization
- Debounced automatic backups triggered by user actions
- Scheduled backups via Chrome alarms API
- Conflict detection and resolution with timestamp comparison
- Safe restore with automatic local backup before sync

## WebDAV Integration

The extension supports any WebDAV-compatible server for cloud backup. Configuration includes:
- Server URL, username, and password
- Backup frequency (minimum 15 minutes)
- Maximum number of stored snapshots

Backup files use timestamped naming: `{prefix}_{yyMMdd_HHmmss_sss}.json`

## Web Compatibility

A web version can be deployed to platforms like Vercel, sharing core logic:
- `api/webdav.js` serves as a CORS proxy for WebDAV operations
- `vercel.json` handles routing for the web deployment
- Shared modules in `scripts/` work across both extension and web environments

## Security Considerations

- WebDAV credentials are stored in Chrome's local storage (not synced)
- CORS proxy validates and forwards only WebDAV-specific headers
- No sensitive data is logged or transmitted outside WebDAV operations
- Automatic data validation prevents corruption during sync operations

## Common Development Tasks

### Adding New Bookmark Features
- Modify bookmark data structure in `storage.js` DEFAULT_DATA
- Update CRUD operations in `storage.js`
- Add UI handling in `app.js` bookmark rendering functions

### Extending WebDAV Functionality
- Core WebDAV operations are in `mytab/scripts/webdav.js`
- Shared sync logic is in `webdav-sync.js` for cross-platform compatibility
- Background operations are handled in `service_worker.js`

### UI Modifications
- Styles are in `mytab/styles.css`
- HTML templates are embedded in `index.html`
- Dynamic rendering logic is in `app.js`