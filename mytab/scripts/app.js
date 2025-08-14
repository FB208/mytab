import { ensureInit, readAll, addFolder, renameFolder, deleteFolder, addSubfolder, renameSubfolder, deleteSubfolder, addBookmark, renameBookmark, deleteBookmark, buildFaviconUrl, updateBookmarkMono, updateBookmarkFavicon, updateBookmark, reorderBookmarksRelative, moveBookmark, updateBookmarkRemark } from './storage.js';

let state = {
  selectedFolderId: null,
  selectedSubId: null,
  keyword: ''
};

await ensureInit();
await bootstrap();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'data:changed') {
    render();
  }
});

// 监听所有操作以触发“操作型自动备份”
async function recordHandleBackup() {
  try { await chrome.runtime.sendMessage({ type: 'backup:manual', source: 'auto' }); } catch (e) {}
}

async function bootstrap() {
  bindEvents();
  await render();
}

function bindEvents() {
  document.getElementById('btn-settings').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  document.getElementById('btn-add-folder').addEventListener('click', async () => {
    const name = await textPrompt({ title: '新建一级文件夹', placeholder: '文件夹名称' });
    if (!name) return;
    const folder = await addFolder(name);
    state.selectedFolderId = folder.id;
    state.selectedSubId = null;
    render();
  });

  document.getElementById('btn-add-subfolder').addEventListener('click', async () => {
    if (!state.selectedFolderId) return toast('请先选择一个一级文件夹');
    const name = await textPrompt({ title: '新建二级文件夹', placeholder: '二级文件夹名称' });
    if (!name) return;
    await addSubfolder(state.selectedFolderId, name);
    render();
  });

  document.getElementById('btn-add-bookmark').addEventListener('click', async () => {
    if (!state.selectedFolderId) return alert('请先选择一个一级文件夹');
    openBookmarkModal({ mode: 'add' });
  });

  document.getElementById('search').addEventListener('input', (e) => {
    state.keyword = e.target.value.trim();
    renderBookmarkGrid();
    triggerGlobalSearch(state.keyword);
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
  if (!keyword) { toggleSearch(false); return; }
  searchTimer = setTimeout(async () => {
    const items = await collectGlobalMatches(keyword);
    if (items.length === 0) { toggleSearch(false); return; }
    renderSearchList(items);
    toggleSearch(true);
  }, 250);
}

async function collectGlobalMatches(keyword) {
  const k = keyword.toLowerCase();
  const { data } = await readAll();
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
      img.src = it.iconUrl; cover.appendChild(img);
    } else if (it.mono) {
      const m = document.createElement('div');
      m.className = 'mono'; m.style.background = it.mono.color; m.textContent = (it.mono.letter || '?').toUpperCase();
      cover.appendChild(m);
    }
    const meta = document.createElement('div'); meta.className = 'meta';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = it.name;
    const url = document.createElement('div'); url.className = 'url'; url.textContent = it.url;
    meta.appendChild(name); meta.appendChild(url);
    row.appendChild(cover); row.appendChild(meta);
    row.addEventListener('click', () => window.open(it.url, '_blank'));
    searchModal.list.appendChild(row);
  });
}
}

async function render() {
  const { data } = await readAll();
  const bg = document.getElementById('bg');
  bg.style.backgroundImage = data.backgroundImage ? `url(${data.backgroundImage})` : '';
  renderFolderList();
  renderSubfolders();
  renderBookmarkGrid();
}

async function renderFolderList() {
  const { data } = await readAll();
  const list = document.getElementById('folder-list');
  list.innerHTML = '';
  const tpl = document.getElementById('tpl-folder-item');

  if (!state.selectedFolderId && data.folders[0]) state.selectedFolderId = data.folders[0].id;

  data.folders.forEach(folder => {
    const el = tpl.content.firstElementChild.cloneNode(true);
    el.dataset.id = folder.id;
    el.querySelector('.icon').textContent = folder.icon || '📁';
    el.querySelector('.name').textContent = folder.name;
    if (folder.id === state.selectedFolderId) el.classList.add('active');
    // 作为拖拽目标：允许放置书签，移动到该一级文件夹
    el.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      const bookmarkId = ev.dataTransfer.getData('text/plain');
      if (!bookmarkId) return;
      const { data } = await readAll();
      const currentFolder = data.folders.find(f => f.id === state.selectedFolderId);
      if (!currentFolder) return;
      const ok = await moveBookmark({ sourceFolderId: state.selectedFolderId, sourceSubId: state.selectedSubId, bookmarkId, targetFolderId: folder.id, targetSubId: null });
      if (ok) { renderBookmarkGrid(); }
    });
    el.addEventListener('click', () => {
      state.selectedFolderId = folder.id;
      state.selectedSubId = null;
      document.getElementById('current-folder-name').textContent = folder.name;
      renderFolderList();
      renderSubfolders();
      renderBookmarkGrid();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, [
        { label: '重命名', onClick: async () => { const name = await textPrompt({ title: '重命名', placeholder: folder.name, value: folder.name }); if (name) { await renameFolder(folder.id, name); render(); } } },
        { label: '删除', onClick: async () => { const ok = await confirmPrompt('确认删除该文件夹及其内容？'); if (ok) { await deleteFolder(folder.id); if (state.selectedFolderId === folder.id) { state.selectedFolderId = null; state.selectedSubId = null; } render(); } } }
      ]);
    });
    list.appendChild(el);
  });

  const current = data.folders.find(f => f.id === state.selectedFolderId);
  document.getElementById('current-folder-name').textContent = current?.name || '欢迎 👋';
}

async function renderSubfolders() {
  const { data } = await readAll();
  const wrap = document.getElementById('subfolder-list');
  wrap.innerHTML = '';
  if (!state.selectedFolderId) return;
  const folder = data.folders.find(f => f.id === state.selectedFolderId);
  (folder?.subfolders || []).forEach(sub => {
    const el = document.getElementById('tpl-subfolder-item').content.firstElementChild.cloneNode(true);
    el.dataset.id = sub.id;
    el.querySelector('.name').textContent = sub.name;
    // 作为拖拽目标：允许放置书签，移动到该二级文件夹
    el.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
    el.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      const bookmarkId = ev.dataTransfer.getData('text/plain');
      if (!bookmarkId) return;
      const ok = await moveBookmark({ sourceFolderId: state.selectedFolderId, sourceSubId: state.selectedSubId, bookmarkId, targetFolderId: folder.id, targetSubId: sub.id });
      if (ok) { renderBookmarkGrid(); }
    });
    el.addEventListener('click', () => { state.selectedSubId = sub.id; renderBookmarkGrid(); });
    el.querySelector('.rename').addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = await textPrompt({ title: '重命名', placeholder: sub.name, value: sub.name });
      if (name) { await renameSubfolder(folder.id, sub.id, name); renderSubfolders(); }
    });
    el.querySelector('.delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmPrompt('删除该二级文件夹？');
      if (ok) { await deleteSubfolder(folder.id, sub.id); if (state.selectedSubId === sub.id) state.selectedSubId = null; renderSubfolders(); renderBookmarkGrid(); }
    });
    wrap.appendChild(el);
  });
}

async function renderBookmarkGrid() {
  const { data } = await readAll();
  const grid = document.getElementById('bookmark-grid');
  grid.innerHTML = '';
  if (!state.selectedFolderId) return;
  const folder = data.folders.find(f => f.id === state.selectedFolderId);
  const container = state.selectedSubId ? (folder?.subfolders || []).find(s => s.id === state.selectedSubId) : folder;
  const list = (container?.bookmarks || []).filter(bm => matchKeyword(bm, state.keyword));

  const tpl = document.getElementById('tpl-bookmark-card');
  list.forEach(bm => {
    const el = tpl.content.firstElementChild.cloneNode(true);
    el.dataset.id = bm.id;
    el.title = bm.remark ? `${bm.name || bm.url}\n${bm.remark}` : (bm.name || bm.url);
    const titleEl = el.querySelector('.title');
    if (titleEl) titleEl.textContent = bm.name || bm.url;
    // 拖拽属性
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', bm.id);
      ev.dataTransfer.effectAllowed = 'move';
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
      await reorderBookmarksRelative({ folderId: folder.id, subId: state.selectedSubId, sourceId, targetId });
      renderBookmarkGrid();
    });
    const img = el.querySelector('.favicon');
    const mono = el.querySelector('.mono-icon');
    if (bm.iconType === 'favicon' && bm.iconUrl) {
      img.src = bm.iconUrl;
      img.style.display = 'block';
      mono.style.display = 'none';
      img.onerror = async () => {
        // 自动降级为单色图标并持久化
        const letter = (bm.name || bm.url || 'W')[0] || 'W';
        const color = pickColorFromString(letter);
        await updateBookmarkMono({ folderId: folder.id, subId: state.selectedSubId, bookmarkId: bm.id, letter, color });
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
      openContextMenu(e.clientX, e.clientY, [
        { label: '编辑', onClick: () => openBookmarkModal({ mode: 'edit', bookmark: { ...bm }, folderId: folder.id, subId: state.selectedSubId }) },
        { label: '删除', onClick: async () => { const ok = await confirmPrompt('删除该书签？'); if (ok) { await deleteBookmark({ folderId: folder.id, subId: state.selectedSubId, bookmarkId: bm.id }); renderBookmarkGrid(); } } }
      ]);
    });
    grid.appendChild(el);
  });
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
  let h = 0; for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; } return h;
}

// 轻量 toast
function toast(text, duration = 1600) {
  const t = document.createElement('div');
  t.textContent = text;
  Object.assign(t.style, { position: 'fixed', right: '20px', bottom: '20px', background: 'rgba(15,23,42,0.9)', color: '#fff', padding: '10px 14px', borderRadius: '10px', zIndex: 9999, boxShadow: '0 6px 20px rgba(0,0,0,0.25)', fontSize: '13px' });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, duration - 300);
  setTimeout(() => t.remove(), duration);
}

// 文本输入弹窗
async function textPrompt({ title = '输入', message = '', placeholder = '', value = '' } = {}) {
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
    li.addEventListener('click', () => { hideContextMenu(); it.onClick?.(); });
    ctxMenu.list.appendChild(li);
  });
  ctxMenu.root.style.left = x + 'px';
  ctxMenu.root.style.top = y + 'px';
  ctxMenu.root.classList.remove('hidden');
  const onDoc = () => hideContextMenu();
  setTimeout(() => document.addEventListener('click', onDoc, { once: true }), 0);
}

function hideContextMenu() {
  ctxMenu.root.classList.add('hidden');
}
// Modal 逻辑
const modal = {
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
  fetchFav: document.getElementById('bm-fetch-fav'),
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

let modalCtx = { mode: 'add', bookmarkId: null, folderId: null, subId: null };

function openBookmarkModal({ mode, bookmark = null, folderId = null, subId = null }) {
  modalCtx = { mode, bookmarkId: bookmark?.id || null, folderId: folderId || state.selectedFolderId, subId: subId || state.selectedSubId };
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

let modalKeydownHandler = null;
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

modal.close?.addEventListener('click', () => showModal(false));
modal.cancel?.addEventListener('click', () => showModal(false));

modal.modeRadios().forEach(r => r.addEventListener('change', () => {
  applyIconMode(getIconMode());
  refreshPreview();
}));

[modal.url, modal.favUrl, modal.letter, modal.color].forEach(el => el?.addEventListener('input', refreshPreview));
// 网址变化时自动尝试获取网站图标（防抖）
let favFetchBusy = false;
let favFetchTimer = null;
let favFetchLastUrl = '';
modal.url?.addEventListener('input', () => {
  const url = modal.url.value.trim();
  clearTimeout(favFetchTimer);
  if (!url) return;
  favFetchTimer = setTimeout(() => doFetchFavicons(url, true), 500);
});

modal.save?.addEventListener('click', async () => {
  const folderId = modalCtx.folderId;
  const subId = modalCtx.subId;
  const url = modal.url.value.trim();
  if (!url) { alert('请输入网址'); return; }
  const name = modal.name.value.trim() || undefined;
  const remark = modal.remark.value.trim() || '';
  const mode = getIconMode();
  if (modalCtx.mode === 'add') {
    if (mode === 'favicon') {
      const iconUrl = modal.favUrl.value.trim() || buildFaviconUrl(url);
      await addBookmark({ folderId, subId, url, name, iconUrl, mono: null, remark });
    } else {
      const letter = (modal.letter.value || (name || url || 'W')[0] || 'W').toUpperCase();
      const color = modal.color.value || pickColorFromString(letter);
      await addBookmark({ folderId, subId, url, name, iconUrl: '', mono: { letter, color }, remark });
    }
  } else {
    const bookmarkId = modalCtx.bookmarkId;
    if (mode === 'favicon') {
      const iconUrl = modal.favUrl.value.trim();
      await updateBookmark({ folderId, subId, bookmarkId, url, name, iconType: 'favicon', iconUrl: iconUrl || undefined });
    } else {
      const letter = (modal.letter.value || (name || url || 'W')[0] || 'W').toUpperCase();
      const color = modal.color.value || '#7c5cff';
      await updateBookmark({ folderId, subId, bookmarkId, url, name, iconType: 'mono', mono: { letter, color } });
    }
    // 同步备注
    await updateBookmarkRemark({ folderId, subId, bookmarkId, remark });
  }
  showModal(false);
  renderBookmarkGrid();
});

modal.fetchFav?.addEventListener('click', async () => {
  const url = modal.url.value.trim();
  if (!url) { alert('请先填写网址'); return; }
  await doFetchFavicons(url, false);
});

async function doFetchFavicons(url, isAuto) {
  if (favFetchBusy) return; // 避免重复执行
  if (isAuto && favFetchLastUrl === url) return; // 同一网址防重复
  favFetchBusy = true;
  const btn = modal.fetchFav;
  const prevText = btn?.textContent;
  if (!isAuto && btn) { btn.disabled = true; btn.textContent = '获取中…'; }
  favFetchLastUrl = url;
  try {
    let candidates = [];
    try {
      // 已获授权才使用后台抓取，避免权限弹窗
      let hasPerm = false;
      try { const u = new URL(url); hasPerm = await chrome.permissions.contains({ origins: [u.origin + '/*'] }); } catch (e) {}
      if (hasPerm) {
        const res = await chrome.runtime.sendMessage({ type: 'favicon:fetch', pageUrl: url });
        if (res?.ok) candidates = res.icons || [];
      }
    } catch (e) {}
    if (candidates.length === 0) candidates = await collectFavicons(url);
    const uniq = [...new Set(candidates)];
    renderFavCandidates(uniq);
  } catch (e) {
    if (!isAuto) alert('获取失败');
  } finally {
    favFetchBusy = false;
    if (!isAuto && btn) { btn.disabled = false; btn.textContent = prevText; }
  }
}

function getIconMode() { return modal.modeRadios().find(r => r.checked)?.value || 'favicon'; }

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
    const fav = modal.favUrl.value.trim() || (url ? buildFaviconUrl(url) : '');
    modal.previewFav.src = fav;
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
}

async function collectFavicons(pageUrl) {
  try {
    const u = new URL(pageUrl);
    const origin = u.origin;
    const host = u.hostname;
    const common = [
      '/favicon.ico',
      '/favicon.png',
      '/favicon-32x32.png',
      '/favicon-16x16.png',
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
      '/android-chrome-192x192.png',
      '/android-chrome-512x512.png'
    ].map(p => origin + p);
    const s2 = [
      `https://www.google.com/s2/favicons?sz=64&domain=${host}`,
      `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(pageUrl)}`,
      `https://icons.duckduckgo.com/ip3/${host}.ico`
    ];
    const candidates = [...new Set([...common, ...s2])];
    const results = await Promise.all(candidates.map(testImageLoad));
    return results.filter(Boolean);
  } catch (e) {
    return [];
  }
}

function testImageLoad(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => { resolve(ok ? url : null); };
    img.onload = () => done(true);
    img.onerror = () => done(false);
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
