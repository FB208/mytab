# 文件夹和书签拖动排序和拖入功能文档

## 概述

本项目实现了一个功能完整的文件夹和书签拖动排序与拖入系统，支持多层级文件夹结构、跨文件夹移动、区域识别排序等高级功能。

## 主要相关文件

- `mytab/scripts/app.js` - 主要UI交互逻辑
- `mytab/scripts/storage.js` - 数据存储和业务逻辑

## 核心功能函数

### 拖拽状态管理

```javascript
// 文件：app.js
// 行号：37-40
let dragState = {
  type: null, // 'bookmark', 'folder', 或向后兼容的'subfolder'
  data: null
};
```

### 文件夹拖拽排序函数

#### 一级文件夹排序
```javascript
// 文件：storage.js
// 行号：700-728
export async function reorderFolders({
  sourceId,
  targetId
})
// 功能：一级文件夹拖拽排序
```

#### 子文件夹排序
```javascript
// 文件：storage.js
// 行号：737-761
export async function reorderSubfolders({
  parentId,
  sourceId,
  targetId
})
// 功能：子文件夹拖拽排序
```

### 书签拖拽排序函数

```javascript
// 文件：storage.js
// 行号：668-692
export async function reorderBookmarksRelative({
  folderId,
  sourceId,
  targetId
})
// 功能：同一文件夹内书签拖拽排序
```

### 移动功能函数

#### 文件夹移动
```javascript
// 文件：storage.js
// 行号：401-446
export async function moveFolder(folderId, newParentId)
// 功能：移动文件夹到新的父文件夹
```

#### 书签移动
```javascript
// 文件：storage.js
// 行号：633-659
export async function moveBookmark({
  sourceFolderId,
  bookmarkId,
  targetFolderId
})
// 功能：跨文件夹移动书签
```

## 拖拽事件处理

### 一级文件夹拖拽事件

#### 拖拽开始
```javascript
// 文件：app.js
// 行号：421-428
el.addEventListener('dragstart', (ev) => {
  dragState.type = 'folder';
  dragState.data = folder.id;
  ev.dataTransfer.setData('text/plain', `folder:${folder.id}`);
  ev.dataTransfer.effectAllowed = 'move';
  // 存储拖拽信息到全局状态
  sessionStorage.setItem('dragData', `folder:${folder.id}`);
});
```

#### 拖拽结束
```javascript
// 文件：app.js
// 行号：430-435
el.addEventListener('dragend', () => {
  dragState.type = null;
  dragState.data = null;
  sessionStorage.removeItem('dragData');
});
```

#### 拖拽目标事件
```javascript
// 文件：app.js
// 行号：437-485
el.addEventListener('dragover', (ev) => {
  console.log('dragover', ev.dataTransfer.types, sessionStorage.getItem('dragData'));
  ev.preventDefault();
  ev.stopPropagation();

  const rect = el.getBoundingClientRect();
  const clientY = ev.clientY;
  const centerY = rect.top + rect.height / 2;
  const threshold = rect.height * 0.25; // 25% 的区域用于排序

  // 清除所有拖拽样式
  el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

  const dragData = sessionStorage.getItem('dragData');

  if (dragData && dragData.startsWith('folder:')) {
    const moveFolderId = dragData.replace('folder:', '');
    const movingFolder = findFolderById(data.folders, moveFolderId);

    // 只有同级一级文件夹才支持排序
    if (movingFolder && !movingFolder.parentId && !folder.parentId && moveFolderId !== folder.id) {
      if (clientY < centerY - threshold) {
        // 上方区域：排序到前面
        el.classList.add('drag-over-top');
        ev.dataTransfer.dropEffect = 'move';
      } else if (clientY > centerY + threshold) {
        // 下方区域：排序到后面
        el.classList.add('drag-over-bottom');
        ev.dataTransfer.dropEffect = 'move';
      } else {
        // 中间区域：移入文件夹
        console.log('drag-over-center', ev.dataTransfer.types, sessionStorage.getItem('dragData'));
        el.classList.add('drag-over-center');
        ev.dataTransfer.dropEffect = 'move';
      }
      return;
    }
  }

  // 其他情况（书签拖拽或不同级文件夹）：移入文件夹
  el.classList.add('drag-over-center');
  ev.dataTransfer.dropEffect = 'move';
});
```

#### 放置事件
```javascript
// 文件：app.js
// 行号：485-558
el.addEventListener('drop', async (ev) => {
  console.log('drop', ev);
  ev.preventDefault();
  ev.stopPropagation();
  el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

  const dragData = ev.dataTransfer.getData('text/plain');
  if (!dragData) return;

  // 处理文件夹拖拽排序和移动
  if (dragData.startsWith('folder:')) {
    const moveFolderId = dragData.replace('folder:', '');
    if (moveFolderId === folder.id) return; // 不能拖拽到自己

    const movingFolder = findFolderById(data.folders, moveFolderId);

    // 检查是否是同级一级文件夹之间的排序
    if (movingFolder && !movingFolder.parentId && !folder.parentId) {
      // 判断拖拽区域决定操作类型
      const rect = el.getBoundingClientRect();
      const clientY = ev.clientY;
      const centerY = rect.top + rect.height / 2;
      const threshold = rect.height * 0.25;

      if (clientY < centerY - threshold || clientY > centerY + threshold) {
        // 上方或下方区域：执行排序
        const ok = await reorderFolders({
          sourceId: moveFolderId,
          targetId: folder.id
        });
        if (ok) {
          renderFolderList();
        }
      } else {
        // 中间区域：执行移动
        const ok = await moveFolder(moveFolderId, folder.id);
        if (ok) {
          renderFolderList();
          renderSubfolders();
          renderBookmarkGrid();
        }
      }
    } else {
      // 不同级文件夹：只能移动
      const ok = await moveFolder(moveFolderId, folder.id);
      if (ok) {
        renderFolderList();
        renderSubfolders();
        renderBookmarkGrid();
      }
    }
    return;
  }

  // 处理书签拖拽
  if (dragData.startsWith('bookmark:')) {
    const parts = dragData.split(':');
    if (parts.length >= 3) {
      const bookmarkId = parts[1];
      const sourceFolderId = parts[2];

      const ok = await moveBookmark({
        sourceFolderId,
        bookmarkId,
        targetFolderId: folder.id
      });
      if (ok) {
        renderBookmarkGrid();
      }
    }
    return;
  }
});
```

### 子文件夹拖拽事件

#### 拖拽开始
```javascript
// 文件：app.js
// 行号：742-749
el.addEventListener('dragstart', (ev) => {
  dragState.type = 'folder';
  dragState.data = subfolder.id;
  ev.dataTransfer.setData('text/plain', `folder:${subfolder.id}`);
  ev.dataTransfer.effectAllowed = 'move';
  // 存储到sessionStorage以便在dragover中访问
  sessionStorage.setItem('dragData', `folder:${subfolder.id}`);
});
```

#### 拖拽目标事件
```javascript
// 文件：app.js
// 行号：758-800
el.addEventListener('dragover', (ev) => {
  ev.preventDefault();

  const rect = el.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const width = rect.width;
  const height = rect.height;

  // 清除所有拖拽样式
  el.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-center');

  const dragData = sessionStorage.getItem('dragData');

  if (dragData && dragData.startsWith('folder:')) {
    const moveFolderId = dragData.replace('folder:', '');
    const movingFolder = findFolderById(data.folders, moveFolderId);

    // 只有同级子文件夹才支持排序
    if (movingFolder && movingFolder.parentId === currentFolder.id && moveFolderId !== subfolder.id) {
      // 划分区域：左侧40%、右侧40%、中间20%
      if (x < width * 0.4) {
        // 左侧区域：排序到前面
        el.classList.add('drag-over-left');
        ev.dataTransfer.dropEffect = 'move';
      } else if (x > width * 0.6) {
        // 右侧区域：排序到后面
        el.classList.add('drag-over-right');
        ev.dataTransfer.dropEffect = 'move';
      } else {
        // 中间区域：移入子文件夹
        el.classList.add('drag-over-center');
        ev.dataTransfer.dropEffect = 'move';
      }
      return;
    }
  }

  // 其他情况（书签拖拽或不同级文件夹）：移入文件夹
  el.classList.add('drag-over-center');
  ev.dataTransfer.dropEffect = 'move';
});
```

#### 放置事件
```javascript
// 文件：app.js
// 行号：806-887
el.addEventListener('drop', async (ev) => {
  console.log('subfolder drop', ev);
  ev.preventDefault();
  el.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-center');

  const dragData = ev.dataTransfer.getData('text/plain');

  // 处理文件夹拖拽
  if (dragData.startsWith('folder:')) {
    const moveFolderId = dragData.replace('folder:', '');
    if (moveFolderId === subfolder.id) return;

    const movingFolder = findFolderById(data.folders, moveFolderId);

    // 检查是否是同级子文件夹之间的排序
    if (movingFolder && movingFolder.parentId === currentFolder.id) {
      // 判断拖拽区域决定操作类型
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const width = rect.width;

      if (x < width * 0.4 || x > width * 0.6) {
        // 左侧或右侧区域：执行排序
        const ok = await reorderSubfolders({
          parentId: currentFolder.id,
          sourceId: moveFolderId,
          targetId: subfolder.id
        });
        if (ok) {
          renderBookmarkGrid();
        }
      } else {
        // 中间区域：执行移动
        const ok = await moveFolder(moveFolderId, subfolder.id);
        if (ok) {
          renderFolderList();
          renderBookmarkGrid();
        }
      }
    } else {
      // 不同级文件夹：只能移动
      const ok = await moveFolder(moveFolderId, subfolder.id);
      if (ok) {
        renderFolderList();
        renderBookmarkGrid();
      }
    }
    return;
  }

  // 处理书签拖拽
  if (dragData.startsWith('bookmark:')) {
    const parts = dragData.split(':');
    if (parts.length >= 3) {
      const bookmarkId = parts[1];
      const sourceFolderId = parts[2];

      const ok = await moveBookmark({
        sourceFolderId,
        bookmarkId,
        targetFolderId: subfolder.id
      });
      if (ok) {
        renderBookmarkGrid();
      }
    }
    return;
  }
});
```

### 书签拖拽事件

#### 拖拽开始
```javascript
// 文件：app.js
// 行号：914-923
el.addEventListener('dragstart', (ev) => {
  console.log('bookmark dragstart', bm.id, state.selectedFolderId);
  dragState.type = 'bookmark';
  dragState.data = { bookmarkId: bm.id, sourceFolderId: state.selectedFolderId };
  const dragData = `bookmark:${bm.id}:${state.selectedFolderId}`;
  ev.dataTransfer.setData('text/plain', dragData);
  ev.dataTransfer.effectAllowed = 'move';
  // 存储到sessionStorage以便在dragover中访问
  sessionStorage.setItem('dragData', dragData);
});
```

#### 拖拽目标事件
```javascript
// 文件：app.js
// 行号：931-963
el.addEventListener('dragover', (ev) => {
  ev.preventDefault();

  const rect = el.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const width = rect.width;

  // 清除所有拖拽样式
  el.classList.remove('drag-over-left', 'drag-over-right');

  const dragData = sessionStorage.getItem('dragData');

  // 只有书签拖拽才显示左右区域识别效果
  if (dragData && dragData.startsWith('bookmark:')) {
    const parts = dragData.split(':');
    if (parts.length >= 3) {
      const sourceFolderId = parts[2];
      // 确保是同一文件夹内的书签排序
      if (sourceFolderId === state.selectedFolderId) {
        // 划分区域：左侧50%、右侧50%
        if (x < width * 0.5) {
          // 左侧区域：排序到前面
          el.classList.add('drag-over-left');
        } else {
          // 右侧区域：排序到后面
          el.classList.add('drag-over-right');
        }
      }
    }
  }

  ev.dataTransfer.dropEffect = 'move';
});
```

#### 放置事件
```javascript
// 文件：app.js
// 行号：967-1001
el.addEventListener('drop', async (ev) => {
  ev.preventDefault();
  el.classList.remove('drag-over-left', 'drag-over-right');
  const dragData = ev.dataTransfer.getData('text/plain');
  const targetId = bm.id;
  if (!dragData || dragData === targetId) return;

  // 检查是否是文件夹拖拽，如果是则跳过
  if (dragData.startsWith('folder:')) return;

  let sourceId;
  if (dragData.startsWith('bookmark:')) {
    const parts = dragData.split(':');
    if (parts.length >= 3) {
      sourceId = parts[1];
      // 对于书签排序，只允许同一文件夹内的书签重排序
      const sourceFolderId = parts[2];
      if (sourceFolderId !== state.selectedFolderId) return;
    } else {
      return;
    }
  } else {
    // 兼容旧格式：纯书签ID
    sourceId = dragData;
  }

  if (!sourceId || sourceId === targetId) return;

  await reorderBookmarksRelative({
    folderId: state.selectedFolderId,
    sourceId,
    targetId
  });
  renderBookmarkGrid();
});
```

## 拖拽区域识别逻辑

### 一级文件夹拖拽区域识别

```javascript
// 文件：app.js
// 行号：443-472
const rect = el.getBoundingClientRect();
const clientY = ev.clientY;
const centerY = rect.top + rect.height / 2;
const threshold = rect.height * 0.25; // 25% 的区域用于排序

if (clientY < centerY - threshold) {
  // 上方区域：排序到前面
  el.classList.add('drag-over-top');
} else if (clientY > centerY + threshold) {
  // 下方区域：排序到后面
  el.classList.add('drag-over-bottom');
} else {
  // 中间区域：移入文件夹
  el.classList.add('drag-over-center');
}
```

### 子文件夹拖拽区域识别

```javascript
// 文件：app.js
// 行号：762-792
const rect = el.getBoundingClientRect();
const x = ev.clientX - rect.left;
const width = rect.width;

// 划分区域：左侧40%、右侧40%、中间20%
if (x < width * 0.4) {
  // 左侧区域：排序到前面
  el.classList.add('drag-over-left');
} else if (x > width * 0.6) {
  // 右侧区域：排序到后面
  el.classList.add('drag-over-right');
} else {
  // 中间区域：移入子文件夹
  el.classList.add('drag-over-center');
}
```

### 书签拖拽区域识别

```javascript
// 文件：app.js
// 行号：934-957
const rect = el.getBoundingClientRect();
const x = ev.clientX - rect.left;
const width = rect.width;

// 划分区域：左侧50%、右侧50%
if (x < width * 0.5) {
  // 左侧区域：排序到前面
  el.classList.add('drag-over-left');
} else {
  // 右侧区域：排序到后面
  el.classList.add('drag-over-right');
}
```

## 拖拽数据传输格式

### 文件夹拖拽数据格式
```javascript
// 格式：folder:文件夹ID
`folder:${folderId}`
```

### 书签拖拽数据格式
```javascript
// 格式：bookmark:书签ID:源文件夹ID
`bookmark:${bookmarkId}:${sourceFolderId}`
```

## 主要功能特点

1. **多层级支持**：支持一级文件夹、子文件夹、无限层级的拖拽排序
2. **区域识别**：根据拖拽位置的不同区域执行不同操作
3. **跨文件夹移动**：支持书签和文件夹的跨文件夹移动
4. **状态管理**：使用全局dragState和sessionStorage管理拖拽状态
5. **视觉反馈**：拖拽时显示不同的视觉提示（drag-over-top、drag-over-bottom等）
6. **数据持久化**：所有拖拽操作都会更新lastModified时间戳并持久化到存储

## 兼容性处理

### 向后兼容旧API
```javascript
// 文件：storage.js
// 行号：876-906
export async function addSubfolder(folderId, name)
export async function renameSubfolder(folderId, subId, name)
export async function deleteSubfolder(folderId, subId)
export async function moveSubfolder({ sourceParentId, subId, targetParentId })
```

## 总结

这个拖拽系统实现了以下核心功能：

1. **文件夹排序**：支持一级文件夹和子文件夹的拖拽排序
2. **文件夹移动**：支持文件夹跨层级的移动
3. **书签排序**：支持同一文件夹内书签的拖拽排序
4. **书签移动**：支持书签跨文件夹的移动
5. **智能区域识别**：根据拖拽位置的不同区域执行不同的操作
6. **状态管理**：完善的拖拽状态跟踪和清理机制
7. **用户体验**：丰富的视觉反馈和操作提示

该系统为用户提供了直观、灵活的文件夹和书签管理体验，支持复杂的拖拽排序和移动操作。
