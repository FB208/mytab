import {
  ensureInit,
  readAll,
  addFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  addBookmark,
  deleteBookmark,
  buildFaviconUrl,
  updateBookmarkMono,
  updateBookmark,
  reorderBookmarksRelative,
  reorderFolders,
  reorderSubfolders,
  moveBookmark,
  updateBookmarkRemark,
  findFolderById,
  getFolderPath,
  getAllSubfolders,
  DEFAULT_BG_URL,
  // 兼容性导入（已弃用的API）
  addSubfolder,
  renameSubfolder,
  deleteSubfolder,
  moveSubfolder
} from './storage.js';

let state = {
  selectedFolderId: null, // 当前选中的文件夹ID
  currentPath: [], // 当前文件夹路径（面包屑导航）
  keyword: '' // 搜索关键词
};

// 拖拽状态跟踪
let dragState = {
  type: null, // 'bookmark', 'folder', 或向后兼容的'subfolder' 
  data: null
};

// Modal相关变量
let modal;
let modalCtx = {
  mode: 'add',
  bookmarkId: null,
  folderId: null
};
let modalFavCandidates = [];
let fetchTimer = null;
let modalKeydownHandler = null;
let hasCheckedCloudOnStartup = false;
let globalLoading = null;
let isSyncing = false;

await ensureInit();
await bootstrap();
// 延迟检查云端数据，避免与初始化冲突
setTimeout(() => {
  checkCloudDataAndPrompt();
}, 1000);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'data:changed') {
    render();
  }
});

// 监听所有操作以触发“操作型自动备份”
async function recordHandleBackup() {
  try {
    await chrome.runtime.sendMessage({
      type: 'backup:manual',
      source: 'auto'
    });
  } catch (e) {}
}

// 检查是否正在同步，如果是则阻止操作
function checkSyncStatus() {
  if (isSyncing) {
    toast('⚠️ 正在同步数据，请稍候完成后再操作', 2000);
    return false;
  }
  return true;
}

async function bootstrap() {
  bindEvents();
  await render();
}

function bindEvents() {
  // 初始化modal对象
  modal = {
    backdrop: document.getElementById('modal-backdrop'),
    root: document.getElementById('bookmark-modal'),
    title: document.getElementById('modal-title'),
    close: document.getElementById('modal-close'),
    cancel: document.getElementById('modal-cancel'),
    save: document.getElementById('modal-save'),
    url: document.getElementById('bm-url'),
    name: document.getElementById('bm-name'),
    remark: document.getElementById('bm-remark'),
    favUrl: document.getElementById('bm-favicon'),
    fetchStatus: document.getElementById('fetch-status'),
    favCandidatesWrap: document.getElementById('row-fav-candidates'),
    favCandidates: document.getElementById('bm-fav-candidates'),
    letter: document.getElementById('bm-letter'),
    color: document.getElementById('bm-color'),
    rowFav: document.getElementById('row-favicon'),
    rowMono: document.getElementById('row-mono'),
    previewFav: document.getElementById('preview-fav'),
    previewMono: document.getElementById('preview-mono'),
    modeRadios: () => [...document.querySelectorAll('input[name="icon-mode"]')]
  };

  document.getElementById('btn-settings').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  document.getElementById('btn-add-folder').addEventListener('click', async () => {
    if (!checkSyncStatus()) return;
    
    const name = await textPrompt({
      title: '新建一级文件夹',
      placeholder: '文件夹名称'
    });
    if (!name) return;
    const folder = await addFolder(name);
    state.selectedFolderId = folder.id;
    render();
  });

  document.getElementById('search').addEventListener('input', (e) => {
    state.keyword = e.target.value.trim();
    renderBookmarkGrid();
    triggerGlobalSearch(state.keyword);
  });

  // Mobile sidebar toggle
  const app = document.getElementById('app');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const mainContent = document.querySelector('.content');

  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    app.classList.toggle('sidebar-visible');
  });

  mainContent?.addEventListener('click', () => {
    if (app.classList.contains('sidebar-visible')) {
      app.classList.remove('sidebar-visible');
    }
  });

  // 全局搜索弹窗
  const searchModal = {
    root: document.getElementById('search-modal'),
    close: document.getElementById('search-close'),
    list: document.getElementById('search-list')
  };
  searchModal.close?.addEventListener('click', () => toggleSearch(false));

  let searchTimer = null;

  function triggerGlobalSearch(keyword) {
    clearTimeout(searchTimer);
    if (!keyword) {
      toggleSearch(false);
      return;
    }
    searchTimer = setTimeout(async () => {
      const items = await collectGlobalMatches(keyword);
      if (items.length === 0) {
        toggleSearch(false);
        return;
      }
      renderSearchList(items);
      toggleSearch(true);
    }, 250);
  }

  async function collectGlobalMatches(keyword) {
    const k = keyword.toLowerCase();
    const {
      data
    } = await readAll();
    const results = [];
    data.folders.forEach(folder => {
      const pushItem = (bm, sub) => {
        if (!bm) return;
        const txt = `${bm.name || ''} ${bm.url || ''}`.toLowerCase();
        if (txt.includes(k)) {
          results.push({
            id: bm.id,
            name: bm.name || bm.url,
            url: bm.url,
            iconType: bm.iconType,
            iconUrl: bm.iconUrl,
            mono: bm.mono,
            folderId: folder.id,
            subId: sub?.id || null,
            folderName: folder.name,
            subName: sub?.name || ''
          });
        }
      };
      (folder.bookmarks || []).forEach(b => pushItem(b, null));
      (folder.subfolders || []).forEach(sub => (sub.bookmarks || []).forEach(b => pushItem(b, sub)));
    });
    return results.slice(0, 200);
  }

  function toggleSearch(show) {
    searchModal.root.classList.toggle('hidden', !show);
  }

  function renderSearchList(items) {
    searchModal.list.innerHTML = '';
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'search-item';
      const cover = document.createElement('div');
      cover.className = 'cover';
      if (it.iconType === 'favicon' && it.iconUrl) {
        const img = document.createElement('img');
        img.src = it.iconUrl;
        cover.appendChild(img);
      } else if (it.mono) {
        const m = document.createElement('div');
        m.className = 'mono';
        m.style.background = it.mono.color;
        m.textContent = (it.mono.letter || '?').toUpperCase();
        cover.appendChild(m);
      }
      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = it.name;
      const url = document.createElement('div');
      url.className = 'url';
      url.textContent = it.url;
      meta.appendChild(name);
      meta.appendChild(url);
      row.appendChild(cover);
      row.appendChild(meta);
      row.addEventListener('click', () => window.open(it.url, '_blank'));
      searchModal.list.appendChild(row);
    });
  }

  // Modal事件监听器
  modal.close?.addEventListener('click', () => showModal(false));
  modal.cancel?.addEventListener('click', () => showModal(false));
  modal.save?.addEventListener('click', handleModalSave);

  modal.modeRadios().forEach(r => r.addEventListener('change', () => {
    applyIconMode(getIconMode());
    refreshPreview();
  }));

  [modal.url, modal.favUrl, modal.letter, modal.color].forEach(el => el?.addEventListener('input', refreshPreview));

  modal.url?.addEventListener('input', () => {
    const url = modal.url.value.trim();
    clearTimeout(fetchTimer);
    modal.fetchStatus?.classList.add('hidden');

    if (!url) return;

    fetchTimer = setTimeout(async () => {
      modal.fetchStatus?.classList.remove('hidden');

      try {
        await Promise.all([
          doFetchFavicons(url, true),
          !modal.name.value.trim() ? fetchTitle(url) : Promise.resolve()
        ]);
      } finally {
        setTimeout(() => modal.fetchStatus?.classList.add('hidden'), 1000);
      }
    }, 500);
  });
}

// 更新数据版本显示
function updateDataVersion(data) {
  const versionElement = document.getElementById('version-text');
  if (!versionElement) return;
  
  if (data?.lastModified) {
    const date = new Date(data.lastModified);
    const formatTime = date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    versionElement.textContent = `数据版本: ${formatTime}`;
  } else {
    versionElement.textContent = '数据版本: --';
  }
}

async function render() {
  const {
    data
  } = await readAll();
  const bg = document.getElementById('bg');
  // 只有用户设置了背景图片时才使用，否则使用系统默认
  const url = (data.backgroundImage && data.backgroundImage.trim()) || DEFAULT_BG_URL;
  bg.style.backgroundImage = `url(${url})`;
  
  // 更新当前路径和面包屑导航
  updateCurrentPath(data);
  
  renderFolderList();
  renderSubfolders();
  renderBookmarkGrid();
  updateDataVersion(data);
}

async function renderFolderList() {
  const {
    data
  } = await readAll();
  const list = document.getElementById('folder-list');
  list.innerHTML = '';
  const tpl = document.getElementById('tpl-folder-item');

  // 始终显示根级别（一级）文件夹
  const currentFolders = data.folders.filter(f => !f.parentId);
  
  // 如果没有选中的文件夹，默认选中第一个
  if (!state.selectedFolderId && currentFolders[0]) {
    state.selectedFolderId = currentFolders[0].id;
    updateCurrentPath(data);
  }

  currentFolders.forEach(folder => {
    const el = tpl.content.firstElementChild.cloneNode(true);
    el.dataset.id = folder.id;
    el.querySelector('.icon').textContent = folder.icon || '📁';
    el.querySelector('.name').textContent = folder.name;
    
    // 检查当前选中的文件夹是否是这个文件夹或其子文件夹
    const isActive = checkIfAncestor(data.folders, state.selectedFolderId, folder.id);
    if (isActive) el.classList.add('active');
    
    // 设置为可拖拽
    el.setAttribute('draggable', 'true');
    
    // 拖拽开始：设置拖拽数据
    el.addEventListener('dragstart', (ev) => {
      dragState.type = 'folder';
      dragState.data = folder.id;
      ev.dataTransfer.setData('text/plain', `folder:${folder.id}`);
      ev.dataTransfer.effectAllowed = 'move';
      // 存储拖拽信息到全局状态
      sessionStorage.setItem('dragData', `folder:${folder.id}`);
    });
    
    // 拖拽结束：清理状态
    el.addEventListener('dragend', () => {
      dragState.type = null;
      dragState.data = null;
      sessionStorage.removeItem('dragData');
    });
    
    // 作为拖拽目标：允许放置书签和文件夹
    el.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const clientY = ev.clientY;
      const centerY = rect.top + rect.height / 2;
      const threshold = rect.height * 0.25; // 25% 的区域用于排序
      
      // 清除所有拖拽样式
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
      
      const dragData = sessionStorage.getItem('dragData');
      
      if (dragData && dragData.startsWith('folder:')) {
        const moveFolderId = dragData.replace('folder:', '');
        const moveFolder = findFolderById(data.folders, moveFolderId);
        
        // 只有同级一级文件夹才支持排序
        if (moveFolder && !moveFolder.parentId && !folder.parentId && moveFolderId !== folder.id) {
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
            el.classList.add('drag-over-center');
            ev.dataTransfer.dropEffect = 'copy';
          }
          return;
        }
      }
      
      // 其他情况（书签拖拽或不同级文件夹）：移入文件夹
      el.classList.add('drag-over-center');
      ev.dataTransfer.dropEffect = 'copy';
    });
    
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
    });
    el.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
      
      const dragData = ev.dataTransfer.getData('text/plain');
      if (!dragData) return;
      
      // 处理文件夹拖拽排序和移动
      if (dragData.startsWith('folder:')) {
        const moveFolderId = dragData.replace('folder:', '');
        if (moveFolderId === folder.id) return; // 不能拖拽到自己
        
        const moveFolder = findFolderById(data.folders, moveFolderId);
        
        // 检查是否是同级一级文件夹之间的排序
        if (moveFolder && !moveFolder.parentId && !folder.parentId) {
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
      const bookmarkId = dragData;
      if (!state.selectedFolderId) return;
      
      const ok = await moveBookmark({
        sourceFolderId: state.selectedFolderId,
        bookmarkId,
        targetFolderId: folder.id
      });
      if (ok) {
        renderBookmarkGrid();
      }
    });
    
    el.addEventListener('click', () => {
      state.selectedFolderId = folder.id;
      updateCurrentPath(data);
      renderFolderList();
      renderSubfolders();
      renderBookmarkGrid();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, [{
          label: '重命名',
          onClick: async () => {
            const name = await textPrompt({
              title: '重命名',
              placeholder: folder.name,
              value: folder.name
            });
            if (name) {
              await renameFolder(folder.id, name);
              render();
            }
          }
        },
        {
          label: '删除',
          onClick: async () => {
            const ok = await confirmPrompt('确认删除该文件夹及其内容？');
            if (ok) {
              await deleteFolder(folder.id);
              if (state.selectedFolderId === folder.id) {
                state.selectedFolderId = null;
              }
              render();
            }
          }
        }
      ]);
    });
    list.appendChild(el);
  });
}

// 检查一个文件夹是否是另一个文件夹或其祖先
function checkIfAncestor(folders, childId, ancestorId) {
  if (!childId) return false;
  if (childId === ancestorId) return true;
  
  const child = findFolderById(folders, childId);
  if (!child) return false;
  
  // 如果有父文件夹，递归检查
  if (child.parentId) {
    return checkIfAncestor(folders, child.parentId, ancestorId);
  }
  
  return false;
}

// 更新当前路径（面包屑导航）
function updateCurrentPath(data) {
  if (!state.selectedFolderId) {
    state.currentPath = [];
    return;
  }
  state.currentPath = getFolderPath(data.folders, state.selectedFolderId);
  renderBreadcrumb();
}

// 渲染面包屑导航
function renderBreadcrumb() {
  const breadcrumb = document.getElementById('current-folder-name');
  if (!breadcrumb) return; // 如果页面没有面包屑元素，跳过
  
  breadcrumb.innerHTML = '';
  
  // 添加根目录链接
  const homeLink = document.createElement('span');
  homeLink.className = 'breadcrumb-item clickable';
  homeLink.textContent = '🏠 首页';
  homeLink.addEventListener('click', () => {
    state.selectedFolderId = null;
    render();
  });
  breadcrumb.appendChild(homeLink);
  
  // 添加路径链接
  state.currentPath.forEach((folder, index) => {
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = ' / ';
    breadcrumb.appendChild(separator);
    
    const link = document.createElement('span');
    link.className = 'breadcrumb-item';
    link.textContent = folder.name;
    
    // 除了最后一个（当前文件夹）都可以点击
    if (index < state.currentPath.length - 1) {
      link.className += ' clickable';
      link.addEventListener('click', () => {
        state.selectedFolderId = folder.id;
        render();
      });
    } else {
      link.className += ' current';
    }
    
    breadcrumb.appendChild(link);
  });
}

async function renderSubfolders() {
  // 这个函数不再渲染任何内容，子文件夹现在在 renderBookmarkGrid 中作为卡片渲染
  // 保留这个空函数是为了兼容其他地方的调用
  return;
}

async function renderBookmarkGrid() {
  const {
    data
  } = await readAll();
  const grid = document.getElementById('bookmark-grid');
  grid.innerHTML = '';
  if (!state.selectedFolderId) return;
  
  // 使用新的查找方法
  const currentFolder = findFolderById(data.folders, state.selectedFolderId);
  if (!currentFolder) return;
  
  // 当前文件夹就是容器
  const container = currentFolder;
  
  const list = (container?.bookmarks || []).filter(bm => matchKeyword(bm, state.keyword));

  const tpl = document.getElementById('tpl-bookmark-card');
  
  // 首先检查是否需要显示"返回上级"按钮，如果需要则最先添加
  if (currentFolder && currentFolder.parentId) {
    const backEl = tpl.content.firstElementChild.cloneNode(true);
    backEl.dataset.id = 'back';
    backEl.title = '返回上级';
    const img = backEl.querySelector('.favicon');
    const mono = backEl.querySelector('.mono-icon');
    img.style.display = 'none';
    mono.style.display = 'grid';
    mono.style.background = '#d1d5db';
    mono.querySelector('.letter').textContent = '↩';
    const titleEl = backEl.querySelector('.title');
    if (titleEl) titleEl.textContent = '返回上级';
    backEl.addEventListener('click', () => {
      // 返回到父文件夹
      const parentFolder = findFolderById(data.folders, currentFolder.parentId);
      if (parentFolder) {
        state.selectedFolderId = parentFolder.id;
        updateCurrentPath(data);
        renderFolderList();
        renderSubfolders();
        renderBookmarkGrid();
      }
    });
    // 返回项不参与拖拽
    backEl.setAttribute('draggable', 'false');
    grid.appendChild(backEl);
  }
  
  // 然后渲染子文件夹为卡片
  (currentFolder?.children || []).forEach(subfolder => {
      const el = tpl.content.firstElementChild.cloneNode(true);
      el.dataset.id = `folder_${subfolder.id}`;
      el.title = subfolder.name;
      const img = el.querySelector('.favicon');
      const mono = el.querySelector('.mono-icon');
      img.style.display = 'none';
      mono.style.display = 'grid';
      mono.querySelector('.letter').textContent = '📁';
      const titleEl = el.querySelector('.title');
      if (titleEl) titleEl.textContent = subfolder.name;
      
      // 设置为可拖拽
      el.setAttribute('draggable', 'true');
      
      // 拖拽开始：设置拖拽数据
      el.addEventListener('dragstart', (ev) => {
        dragState.type = 'folder';
        dragState.data = subfolder.id;
        ev.dataTransfer.setData('text/plain', `folder:${subfolder.id}`);
        ev.dataTransfer.effectAllowed = 'move';
        // 存储到sessionStorage以便在dragover中访问
        sessionStorage.setItem('dragData', `folder:${subfolder.id}`);
      });
      
      // 拖拽结束：清理状态
      el.addEventListener('dragend', () => {
        dragState.type = null;
        dragState.data = null;
        sessionStorage.removeItem('dragData');
      });
      
      // 作为拖拽目标：区分排序和移动操作
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
          const moveFolder = findFolderById(data.folders, moveFolderId);
          
          // 只有同级子文件夹才支持排序
          if (moveFolder && moveFolder.parentId === currentFolder.id && moveFolderId !== subfolder.id) {
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
              ev.dataTransfer.dropEffect = 'copy';
            }
            return;
          }
        }
        
        // 其他情况（书签拖拽或不同级文件夹）：移入文件夹
        el.classList.add('drag-over-center');
        ev.dataTransfer.dropEffect = 'copy';
      });
      
      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-center');
      });
      
      el.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        el.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-center');
        
        const dragData = ev.dataTransfer.getData('text/plain');
        
        // 处理文件夹拖拽
        if (dragData.startsWith('folder:')) {
          const moveFolderId = dragData.replace('folder:', '');
          if (moveFolderId === subfolder.id) return;
          
          const moveFolder = findFolderById(data.folders, moveFolderId);
          
          // 检查是否是同级子文件夹之间的排序
          if (moveFolder && moveFolder.parentId === currentFolder.id) {
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
        const bookmarkId = dragData;
        if (!bookmarkId) return;
        
        const ok = await moveBookmark({
          sourceFolderId: state.selectedFolderId,
          bookmarkId,
          targetFolderId: subfolder.id
        });
        if (ok) {
          renderBookmarkGrid();
        }
      });
      
      // 点击进入子文件夹（单击和双击都进入）
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 更新为新的文件夹导航逻辑
        state.selectedFolderId = subfolder.id;
        updateCurrentPath(data);
        renderFolderList();
        renderSubfolders();
        renderBookmarkGrid();
      });
      
      grid.appendChild(el);
    });
  
  // "返回上级"按钮已经在最前面添加了，这里直接渲染书签
  list.forEach(bm => {
    const el = tpl.content.firstElementChild.cloneNode(true);
    el.dataset.id = bm.id;
    el.title = bm.remark ? `${bm.name || bm.url}\n${bm.remark}` : (bm.name || bm.url);
    const titleEl = el.querySelector('.title');
    if (titleEl) titleEl.textContent = bm.name || bm.url;
    // 拖拽属性
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (ev) => {
      dragState.type = 'bookmark';
      dragState.data = bm.id;
      ev.dataTransfer.setData('text/plain', bm.id);
      ev.dataTransfer.effectAllowed = 'move';
    });
    
    // 拖拽结束：清理状态
    el.addEventListener('dragend', () => {
      dragState.type = null;
      dragState.data = null;
    });
    el.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      const sourceId = ev.dataTransfer.getData('text/plain');
      const targetId = bm.id;
      if (!sourceId || sourceId === targetId) return;
      // 检查是否是文件夹拖拽，如果是则跳过
      if (sourceId.startsWith('folder:')) return;
      
      await reorderBookmarksRelative({
        folderId: state.selectedFolderId,
        sourceId,
        targetId
      });
      renderBookmarkGrid();
    });
    const img = el.querySelector('.favicon');
    const mono = el.querySelector('.mono-icon');
    if (bm.iconType === 'favicon' && bm.iconUrl) {
      img.src = bm.iconDataUrl || bm.iconUrl;
      img.style.display = 'block';
      mono.style.display = 'none';
      img.onload = () => {
        if (!bm.iconDataUrl && bm.iconUrl) {
          imageToDataUrl(bm.iconUrl).then((dataUrl) => {
            if (dataUrl) updateBookmark({
              folderId: state.selectedFolderId,
              bookmarkId: bm.id,
              url: bm.url,
              name: bm.name,
              iconType: 'favicon',
              iconUrl: bm.iconUrl,
              iconDataUrl: dataUrl
            });
          }).catch(() => {});
        }
      };
      img.onerror = async () => {
        // 自动降级为单色图标并持久化
        const letter = (bm.name || bm.url || 'W')[0] || 'W';
        const color = pickColorFromString(letter);
        await updateBookmarkMono({
          folderId: state.selectedFolderId,
          bookmarkId: bm.id,
          letter,
          color
        });
        renderBookmarkGrid();
      };
    } else if (bm.mono) {
      mono.style.display = 'grid';
      mono.style.background = bm.mono.color;
      mono.querySelector('.letter').textContent = (bm.mono.letter || '?').toUpperCase();
      img.style.display = 'none';
    }
    el.addEventListener('click', () => window.open(bm.url, '_blank'));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, [{
          label: '编辑',
          onClick: () => openBookmarkModal({
            mode: 'edit',
            bookmark: {
              ...bm
            },
            folderId: state.selectedFolderId
          })
        },
        {
          label: '删除',
          onClick: async () => {
            const ok = await confirmPrompt('删除该书签？');
            if (ok) {
              await deleteBookmark({
                folderId: state.selectedFolderId,
                bookmarkId: bm.id
              });
              renderBookmarkGrid();
            }
          }
        }
      ]);
    });
    grid.appendChild(el);
  });

  // Add the virtual "Add New" card
  if (state.selectedFolderId) {
    const addEl = tpl.content.firstElementChild.cloneNode(true);
    addEl.id = 'btn-add-new-item';
    addEl.title = '添加书签或文件夹';

    const title = addEl.querySelector('.title');
    const img = addEl.querySelector('.favicon');
    const mono = addEl.querySelector('.mono-icon');

    if (title) title.textContent = '添加';
    if (img) img.style.display = 'none';

    if (mono) {
      mono.style.display = 'grid';
      mono.style.background = '#d1d5db'; // A neutral gray color
      const letter = mono.querySelector('.letter');
      if (letter) letter.textContent = '+';
    }

    addEl.setAttribute('draggable', 'false');
    addEl.addEventListener('contextmenu', (e) => e.preventDefault());

    addEl.addEventListener('click', async () => {
      const choice = await choicePrompt();
      if (!choice) return;

      if (choice === 'bookmark') {
        openBookmarkModal({
          mode: 'add'
        });
      } else if (choice === 'folder') {
        if (!state.selectedFolderId) return toast('请先选择一个文件夹');
        
        const name = await textPrompt({
          title: '新建子文件夹',
          placeholder: '文件夹名称'
        });
        if (name) {
          // 在当前选中的文件夹下创建子文件夹
          await addFolder(name, state.selectedFolderId);
          render();
        }
      }
    });

    grid.appendChild(addEl);
  }
}

function matchKeyword(bm, kw) {
  if (!kw) return true;
  const k = kw.toLowerCase();
  return (bm.name || '').toLowerCase().includes(k) || (bm.url || '').toLowerCase().includes(k);
}

function pickColorFromString(s) {
  const colors = ['#7c5cff', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#22c55e'];
  const idx = Math.abs(hashCode(s)) % colors.length;
  return colors[idx];
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h;
}

// 轻量 toast
function toast(text, duration = 1600) {
  const t = document.createElement('div');
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    background: 'rgba(15,23,42,0.9)',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '10px',
    zIndex: 9999,
    boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
    fontSize: '13px'
  });
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
  }, duration - 300);
  setTimeout(() => t.remove(), duration);
}

// 文本输入弹窗
async function textPrompt({
  title = '输入',
  message = '',
  placeholder = '',
  value = ''
} = {}) {
  const root = document.getElementById('text-modal');
  const backdrop = document.getElementById('modal-backdrop');
  const titleEl = document.getElementById('tm-title');
  const msgEl = document.getElementById('tm-message');
  const input = document.getElementById('tm-input');
  const btnClose = document.getElementById('tm-close');
  const btnCancel = document.getElementById('tm-cancel');
  const btnSave = document.getElementById('tm-save');
  return new Promise((resolve) => {
    titleEl.textContent = title;
    msgEl.textContent = message;
    msgEl.classList.toggle('hidden', !message);
    input.placeholder = placeholder;
    input.value = value;
    root.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    input.focus();
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(input.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup('');
      }
    };
    input.addEventListener('keydown', onKey);
    const cleanup = (val) => {
      root.classList.add('hidden');
      backdrop.classList.add('hidden');
      btnClose.onclick = btnCancel.onclick = btnSave.onclick = null;
      input.removeEventListener('keydown', onKey);
      resolve(val);
    };
    btnClose.onclick = () => cleanup('');
    btnCancel.onclick = () => cleanup('');
    btnSave.onclick = () => cleanup(input.value.trim());
  });
}

// 确认弹窗（复用文本弹窗的外壳）
async function confirmPrompt(message) {
  const root = document.getElementById('text-modal');
  const backdrop = document.getElementById('modal-backdrop');
  const titleEl = document.getElementById('tm-title');
  const msgEl = document.getElementById('tm-message');
  const input = document.getElementById('tm-input');
  const btnClose = document.getElementById('tm-close');
  const btnCancel = document.getElementById('tm-cancel');
  const btnSave = document.getElementById('tm-save');
  return new Promise((resolve) => {
    titleEl.textContent = '确认';
    msgEl.textContent = message;
    msgEl.classList.remove('hidden');
    input.value = '';
    input.classList.add('hidden');
    root.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    const cleanup = (val) => {
      root.classList.add('hidden');
      backdrop.classList.add('hidden');
      input.classList.remove('hidden');
      btnClose.onclick = btnCancel.onclick = btnSave.onclick = null;
      resolve(val);
    };
    btnClose.onclick = () => cleanup(false);
    btnCancel.onclick = () => cleanup(false);
    btnSave.onclick = () => cleanup(true);
  });
}

// 选择弹窗
async function choicePrompt() {
  const root = document.getElementById('choice-modal');
  const backdrop = document.getElementById('modal-backdrop');
  const btnBookmark = document.getElementById('cm-btn-bookmark');
  const btnFolder = document.getElementById('cm-btn-folder');
  const btnClose = document.getElementById('cm-close');

  return new Promise((resolve) => {
    root.classList.remove('hidden');
    backdrop.classList.remove('hidden');

    const cleanup = (val) => {
      root.classList.add('hidden');
      backdrop.classList.add('hidden');
      btnBookmark.onclick = btnFolder.onclick = btnClose.onclick = null;
      resolve(val);
    };

    btnClose.onclick = () => cleanup(null);
    btnBookmark.onclick = () => cleanup('bookmark');
    btnFolder.onclick = () => cleanup('folder');
  });
}

// 自定义右键菜单
const ctxMenu = {
  root: document.getElementById('context-menu'),
  list: document.getElementById('context-menu-list')
};

function openContextMenu(x, y, items) {
  ctxMenu.list.innerHTML = '';
  items.forEach(it => {
    const li = document.createElement('li');
    li.textContent = it.label;
    li.addEventListener('click', () => {
      hideContextMenu();
      it.onClick?.();
    });
    ctxMenu.list.appendChild(li);
  });
  ctxMenu.root.style.left = x + 'px';
  ctxMenu.root.style.top = y + 'px';
  ctxMenu.root.classList.remove('hidden');
  const onDoc = () => hideContextMenu();
  setTimeout(() => document.addEventListener('click', onDoc, {
    once: true
  }), 0);
}

function hideContextMenu() {
  ctxMenu.root.classList.add('hidden');
}
// Modal 逻辑

function openBookmarkModal({
  mode,
  bookmark = null,
  folderId = null
}) {
  modalCtx = {
    mode,
    bookmarkId: bookmark?.id || null,
    folderId: folderId || state.selectedFolderId
  };
  modal.title.textContent = mode === 'add' ? '添加书签' : '编辑书签';
  modal.url.value = bookmark?.url || '';
  modal.name.value = bookmark?.name || '';
  modal.remark.value = bookmark?.remark || '';
  const iconType = bookmark?.iconType || 'favicon';
  modal.modeRadios().forEach(r => r.checked = r.value === iconType);
  modal.favUrl.value = bookmark?.iconUrl || '';
  modal.letter.value = bookmark?.mono?.letter || ((bookmark?.name || bookmark?.url || 'W')[0] || 'W');
  modal.color.value = bookmark?.mono?.color || '#7c5cff';
  applyIconMode(iconType);
  refreshPreview();
  clearFavCandidates();
  showModal(true);
}

function showModal(show) {
  modal.backdrop.classList.toggle('hidden', !show);
  modal.root.classList.toggle('hidden', !show);
  if (show) {
    modalKeydownHandler = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        modal.save?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        modal.cancel?.click();
      }
    };
    modal.root.addEventListener('keydown', modalKeydownHandler);
  } else if (modalKeydownHandler) {
    modal.root.removeEventListener('keydown', modalKeydownHandler);
    modalKeydownHandler = null;
  }
}

// Modal事件监听器已移到bindEvents函数中

// 网址变化时自动尝试获取网站图标和名称（防抖）

async function handleModalSave() {
  const folderId = modalCtx.folderId;
  const url = modal.url.value.trim();
  if (!url) {
    alert('请输入网址');
    return;
  }
  const name = modal.name.value.trim() || undefined;
  const remark = modal.remark.value.trim() || '';
  const mode = getIconMode();
  if (modalCtx.mode === 'add') {
    if (mode === 'favicon') {
      const iconUrl = modal.favUrl.value.trim() || modalFavCandidates[0] || buildFaviconUrl(url);
      const iconDataUrl = iconUrl ? await toDataUrlSafe(iconUrl) : '';
      await addBookmark({
        folderId,
        url,
        name,
        iconUrl,
        iconDataUrl,
        mono: null,
        remark
      });
    } else {
      const letter = (modal.letter.value || (name || url || 'W')[0] || 'W').toUpperCase();
      const color = modal.color.value || pickColorFromString(letter);
      await addBookmark({
        folderId,
        url,
        name,
        iconUrl: '',
        mono: {
          letter,
          color
        },
        remark
      });
    }
  } else {
    const bookmarkId = modalCtx.bookmarkId;
    if (mode === 'favicon') {
      const iconUrl = modal.favUrl.value.trim() || modalFavCandidates[0] || undefined;
      const iconDataUrl = iconUrl ? await toDataUrlSafe(iconUrl) : '';
      await updateBookmark({
        folderId,
        bookmarkId,
        url,
        name,
        iconType: 'favicon',
        iconUrl,
        iconDataUrl
      });
    } else {
      const letter = (modal.letter.value || (name || url || 'W')[0] || 'W').toUpperCase();
      const color = modal.color.value || '#7c5cff';
      await updateBookmark({
        folderId,
        bookmarkId,
        url,
        name,
        iconType: 'mono',
        mono: {
          letter,
          color
        }
      });
    }
    // 同步备注
    await updateBookmarkRemark({
      folderId,
      bookmarkId,
      remark
    });
  }
  showModal(false);
  renderBookmarkGrid();
}



// 获取网站标题
async function fetchTitle(url) {
  try {
    // 优先使用后台获取
    const res = await chrome.runtime.sendMessage({
      type: 'title:fetch',
      url
    });
    if (res?.title) {
      modal.name.value = res.title;
      return;
    }
  } catch (e) {}

  // 后台失败时用域名作为备选
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, '');
    modal.name.value = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  } catch (e) {}
}

// 图标获取状态变量
let favFetchBusy = false;
let favFetchLastUrl = '';

async function doFetchFavicons(url, isAuto) {
  if (favFetchBusy) return;
  if (isAuto && favFetchLastUrl === url) return;
  favFetchBusy = true;
  favFetchLastUrl = url;

  try {
    let candidates = [];
    try {
      let hasPerm = false;
      try {
        const u = new URL(url);
        hasPerm = await chrome.permissions.contains({
          origins: [u.origin + '/*']
        });
      } catch (e) {}
      if (hasPerm) {
        const res = await chrome.runtime.sendMessage({
          type: 'favicon:fetch',
          pageUrl: url
        });
        if (res?.ok) candidates = res.icons || [];
      }
    } catch (e) {}
    if (candidates.length === 0) candidates = await collectFavicons(url);
    const uniq = [...new Set(candidates)];
    renderFavCandidates(uniq);
  } catch (e) {
    // 静默失败
  } finally {
    favFetchBusy = false;
  }
}



function getIconMode() {
  return modal.modeRadios().find(r => r.checked)?.value || 'favicon';
}

function applyIconMode(mode) {
  const isFav = mode === 'favicon';
  modal.rowFav.classList.toggle('hidden', !isFav);
  modal.rowMono.classList.toggle('hidden', isFav);
}

function refreshPreview() {
  const mode = getIconMode();
  if (mode === 'favicon') {
    modal.previewFav.style.display = 'block';
    modal.previewMono.style.display = 'none';
    const url = modal.url.value.trim();
    const manual = modal.favUrl.value.trim();
    const fav = manual || (modalFavCandidates && modalFavCandidates[0]) || (url ? buildFaviconUrl(url) : '');
    if (fav) modal.previewFav.src = fav;
    // 如果已有缓存图（dataURL），优先使用
    // 预览阶段不读取缓存，保存时写入；显示阶段会用缓存
  } else {
    modal.previewFav.style.display = 'none';
    modal.previewMono.style.display = 'grid';
    const letter = (modal.letter.value || (modal.name.value || modal.url.value || 'W')[0] || 'W').toUpperCase();
    modal.previewMono.querySelector('.letter').textContent = letter;
    modal.previewMono.style.background = modal.color.value || '#7c5cff';
  }
}

function clearFavCandidates() {
  if (!modal.favCandidates) return;
  modal.favCandidates.innerHTML = '';
  modal.favCandidatesWrap?.classList.add('hidden');
}

function renderFavCandidates(urls) {
  clearFavCandidates();
  if (!urls || urls.length === 0) return;
  modalFavCandidates = urls;
  modal.favCandidatesWrap?.classList.remove('hidden');
  urls.forEach(u => {
    const item = document.createElement('div');
    item.className = 'fav-candidate';
    const img = document.createElement('img');
    img.src = u;
    item.appendChild(img);
    item.title = u;
    item.addEventListener('click', () => {
      modal.favUrl.value = u;
      refreshPreview();
    });
    modal.favCandidates.appendChild(item);
  });
  // 自动预览第一个候选（若未手填）
  if (getIconMode() === 'favicon' && !modal.favUrl.value.trim() && urls[0]) {
    modal.previewFav.src = urls[0];
  }
}

// 使用统一的图标获取逻辑（从favicon-utils.js导入）
async function collectFavicons(pageUrl) {
  // 导入共享的图标获取函数
  const { collectFavicons: sharedCollectFavicons } = await import('./favicon-utils.js');
  
  // 图标验证函数：在浏览器环境中测试图片加载
  const validateIcon = async (href) => {
    return await testImageLoad(href);
  };

  // 使用统一的图标收集逻辑
  return await sharedCollectFavicons(pageUrl, fetch, validateIcon);
}



function testImageLoad(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => {
      resolve(ok ? url : null);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url + (url.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`);
  });
}

async function toDataUrlSafe(url) {
  try {
    const res = await fetch(url, {
      mode: 'no-cors'
    });
    // no-cors 响应可能是 opaque，直接读取会失败；退化到 <img> 画布
  } catch (e) {}
  return await imageToDataUrl(url).catch(() => '');
}

function imageToDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        // draw contain
        const ratio = Math.min(size / img.width, size / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url + (url.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`);
  });
}

// 回退逻辑恢复为 origin + /favicon.ico

function extractIconsFromHtml(html, base) {
  const results = [];
  const re = /<link[^>]+rel=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const rel = (m[1] || '').toLowerCase();
    if (!/(icon|shortcut icon|apple-touch-icon)/.test(rel)) continue;
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const url = href.startsWith('http') ? href : (href.startsWith('/') ? (base + href) : (base + '/' + href));
    results.push(url);
  }
  return results;
}

// 检查云端数据并提示用户（仅在页面首次加载时执行）
async function checkCloudDataAndPrompt() {
  // 确保只在页面首次加载时执行一次
  if (hasCheckedCloudOnStartup) {
    console.log('跳过云端检查（已在启动时检查过）');
    return;
  }
  hasCheckedCloudOnStartup = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'cloud:check'
    });
    
    if (!response?.ok) {
      console.warn('云端检查失败:', response?.error);
      return;
    }
    if (!response?.result?.hasNewerData) {
      return;
    }

    const {
      cloudFile,
      cloudTime,
      localTime
    } = response.result;

    // 显示同步提示
    const shouldSync = await showSyncPrompt(cloudFile.name, cloudTime, localTime);
    if (shouldSync) {
      await syncFromCloudWithFeedback(cloudFile.name);
    }
  } catch (e) {
    console.warn('检查云端数据失败:', e);
  }
}

// 显示同步提示弹窗
async function showSyncPrompt(fileName, cloudTime, localTime) {
  return new Promise((resolve) => {
    // 创建同步提示弹窗
    const syncModal = document.createElement('div');
    syncModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    syncModal.innerHTML = `
      <div style="
        background: white;
        border-radius: 8px;
        padding: 24px;
        max-width: 400px;
        margin: 16px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      ">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="
            width: 40px;
            height: 40px;
            background: #dbeafe;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
          ">
            <svg width="24" height="24" fill="none" stroke="#2563eb" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 600; color: #111827; margin: 0;">发现云端更新</h3>
        </div>
        <div style="margin-bottom: 16px; font-size: 14px; color: #6b7280;">
          <p style="margin-bottom: 8px;">检测到云端有更新的数据：</p>
          <div style="background: #f9fafb; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
            <p style="margin: 4px 0;"><strong>云端文件：</strong>${fileName}</p>
            <p style="margin: 4px 0;"><strong>云端时间：</strong>${cloudTime}</p>
            <p style="margin: 4px 0;"><strong>本地时间：</strong>${localTime}</p>
          </div>
          <p style="margin-top: 8px; color: #d97706;">
            <strong>注意：</strong>同步前会自动备份当前本地数据，确保数据安全。
          </p>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button id="sync-cancel" style="
            padding: 8px 16px;
            color: #6b7280;
            background: transparent;
            border: none;
            cursor: pointer;
            border-radius: 4px;
          ">
            稍后再说
          </button>
          <button id="sync-confirm" style="
            padding: 8px 16px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">
            立即同步
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(syncModal);

    const cleanup = (result) => {
      document.body.removeChild(syncModal);
      resolve(result);
    };

    syncModal.querySelector('#sync-cancel').addEventListener('click', () => cleanup(false));
    syncModal.querySelector('#sync-confirm').addEventListener('click', () => cleanup(true));

    // 点击背景关闭
    syncModal.addEventListener('click', (e) => {
      if (e.target === syncModal) cleanup(false);
    });
  });
}

// 执行同步并显示反馈
async function syncFromCloudWithFeedback(fileName) {
  if (isSyncing) {
    toast('⚠️ 正在同步中，请稍候...', 2000);
    return;
  }
  
  isSyncing = true;
  showGlobalLoading('正在同步云端数据...');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'cloud:sync',
      fileName
    });

    if (response?.ok) {
      // 同步成功，刷新界面
      await render();
      hideGlobalLoading();
      toast('✅ 同步成功！数据已更新', 2000);
    } else {
      throw new Error(response?.error || '同步失败');
    }
  } catch (e) {
    hideGlobalLoading();
    toast(`❌ 同步失败：${e.message}`, 3000);
    console.error('同步失败:', e);
  } finally {
    isSyncing = false;
  }
}

// 显示加载提示
function showLoadingToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center';
  toast.innerHTML = `
    <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    ${message}
  `;
  document.body.appendChild(toast);
  return toast;
}

// 隐藏加载提示
function hideLoadingToast(toast) {
  if (toast && toast.parentNode) {
    toast.parentNode.removeChild(toast);
  }
}

// 显示全局loading遮罩
function showGlobalLoading(message = '正在同步数据...') {
  if (globalLoading) return globalLoading;
  
  globalLoading = document.createElement('div');
  globalLoading.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 20000;
    color: white;
    font-size: 16px;
  `;
  
  globalLoading.innerHTML = `
    <div style="
      background: rgba(255, 255, 255, 0.1);
      padding: 32px;
      border-radius: 12px;
      text-align: center;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    ">
      <div style="
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top: 3px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      "></div>
      <div style="font-weight: 500;">${message}</div>
      <div style="font-size: 14px; opacity: 0.8; margin-top: 8px;">请勿关闭页面或进行其他操作</div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  document.body.appendChild(globalLoading);
  
  // 禁用页面滚动
  document.body.style.overflow = 'hidden';
  
  return globalLoading;
}

// 隐藏全局loading遮罩
function hideGlobalLoading() {
  if (globalLoading && globalLoading.parentNode) {
    globalLoading.parentNode.removeChild(globalLoading);
    globalLoading = null;
    
    // 恢复页面滚动
    document.body.style.overflow = '';
  }
}