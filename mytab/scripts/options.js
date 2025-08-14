import { readAll, writeSettings, writeData, DEFAULT_BG_URL } from './storage.js';

const els = {
  url: document.getElementById('dav-url'),
  username: document.getElementById('dav-username'),
  password: document.getElementById('dav-password'),
  backHome: document.getElementById('btn-back-home'),
  enabled: document.getElementById('backup-enabled'),
  hours: document.getElementById('backup-hours'),
  max: document.getElementById('backup-max'),
  test: document.getElementById('btn-test'),
  save: document.getElementById('btn-save'),
  backupNow: document.getElementById('btn-backup-now'),
  refresh: document.getElementById('btn-refresh-list'),
  list: document.getElementById('backup-list'),
  bgUrl: document.getElementById('bg-url'),
  bgSave: document.getElementById('btn-bg-save')
};

await init();

async function init() {
  const { settings, data } = await readAll();
  els.url.value = settings.webdav?.url || '';
  els.username.value = settings.webdav?.username || '';
  els.password.value = settings.webdav?.password || '';
  els.enabled.checked = !!settings.backup?.enabled;
  els.hours.value = settings.backup?.frequencyHours ?? 4;
  els.max.value = settings.backup?.maxSnapshots ?? 100;
  els.bgUrl.value = (data.backgroundImage && data.backgroundImage.trim()) ? data.backgroundImage : DEFAULT_BG_URL;

  bind();
  await refreshList();
}

function bind() {
  els.backHome?.addEventListener('click', () => {
    // 打开扩展的新标签页（index.html）
    window.open('index.html', '_self');
  });
  els.save.addEventListener('click', async () => {
    const next = {
      webdav: { url: normalizeUrl(els.url.value), username: els.username.value, password: els.password.value },
      backup: { enabled: els.enabled.checked, frequencyHours: Number(els.hours.value) || 4, maxSnapshots: Math.max(1, Number(els.max.value) || 100) }
    };
    await writeSettings(next);
    toast('已保存');
    // 运行时请求域授权（可选）
    try {
      const u = new URL(next.webdav.url);
      await chrome.permissions.request({ origins: [u.origin + '/*'] });
    } catch (e) {}
  });

  els.test.addEventListener('click', async () => {
    const config = { url: normalizeUrl(els.url.value), username: els.username.value, password: els.password.value };
    const res = await chrome.runtime.sendMessage({ type: 'webdav:test', config });
    if (res?.ok) toast('连接成功'); else toast('连接失败: ' + (res?.error || ''));
  });

  els.backupNow.addEventListener('click', async () => {
    try {
      els.backupNow.disabled = true;
      const oldText = els.backupNow.textContent;
      els.backupNow.textContent = '备份中…';
      toast('开始备份');
      const res = await chrome.runtime.sendMessage({ type: 'backup:manual' });
      if (res?.ok) toast('备份完成'); else toast('失败: ' + (res?.error || ''));
      await refreshList();
      els.backupNow.textContent = oldText;
      els.backupNow.disabled = false;
    } catch (e) {
      els.backupNow.disabled = false;
      els.backupNow.textContent = '立即备份';
      toast('失败: ' + String(e?.message || e));
    }
  });

  els.refresh.addEventListener('click', refreshList);

  els.bgSave.addEventListener('click', async () => {
    const { data } = await readAll();
    data.backgroundImage = els.bgUrl.value.trim();
    await writeData(data);
    toast('背景地址已保存');
  });
}

async function refreshList() {
  try {
    els.list.innerHTML = '加载中...';
    const res = await chrome.runtime.sendMessage({ type: 'backup:list' });
    if (!res?.ok) throw new Error(res?.error || '');
    const items = res.list || [];
    els.list.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = '暂无备份';
      empty.style.opacity = '.65';
      els.list.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'glass';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.name;

      const footerDiv = document.createElement('div');
      footerDiv.className = 'backup-item-footer';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'backup-date';
      dateSpan.textContent = new Date(item.lastmod).toLocaleString();

      const btn = document.createElement('button');
      btn.className = 'mini-btn restore-btn';
      btn.textContent = '恢复';
      btn.addEventListener('click', async () => {
        if (!confirm('确认从该快照恢复？')) return;
        const r = await chrome.runtime.sendMessage({ type: 'backup:restore', name: item.name });
        if (r?.ok) alert('已恢复'); else alert('恢复失败: ' + (r?.error || ''));
      });

      footerDiv.appendChild(dateSpan);
      footerDiv.appendChild(btn);
      
      li.appendChild(nameSpan);
      li.appendChild(footerDiv);

      els.list.appendChild(li);
    });
  } catch (e) {
    els.list.innerHTML = '加载失败: ' + String(e?.message || e);
  }
}

function normalizeUrl(u) {
  if (!u) return '';
  if (!/\/$/.test(u)) return u + '/';
  return u;
}

// 轻量级自动消失提示
function toast(text, duration = 1800) {
  const t = document.createElement('div');
  t.textContent = text;
  t.style.position = 'fixed';
  t.style.right = '20px';
  t.style.bottom = '20px';
  t.style.background = 'rgba(17,24,39,0.9)';
  t.style.color = '#fff';
  t.style.padding = '10px 14px';
  t.style.borderRadius = '10px';
  t.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
  t.style.zIndex = '9999';
  t.style.fontSize = '13px';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, duration - 300);
  setTimeout(() => t.remove(), duration);
}
