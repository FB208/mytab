/**
 * MyTab 扩展选项页面脚本
 * 负责管理扩展的设置配置，包括：
 * - WebDAV 服务器配置
 * - 自动备份设置
 * - 背景图片设置
 * - 备份历史管理
 * - 数据恢复功能
 */

// 导入存储管理模块
import { readAll, writeSettings, writeData } from './storage.js';
import {
  formatDateTime,
  initPageI18n,
  resolveLocale,
  setCurrentLocale,
  t
} from './i18n.js';

/**
 * DOM元素引用映射
 * 集中管理页面中所有需要交互的DOM元素
 */
const els = {
  url: document.getElementById('dav-url'),           // WebDAV服务器URL输入框
  username: document.getElementById('dav-username'), // WebDAV用户名输入框
  password: document.getElementById('dav-password'), // WebDAV密码输入框
  clientIdentifier: document.getElementById('client-identifier'), // 客户端标识输入框
  language: document.getElementById('language-mode'), // 语言选择框
  backHome: document.getElementById('btn-back-home'), // 返回主页按钮
  enabled: document.getElementById('backup-enabled'),  // 自动备份开关复选框
  hours: document.getElementById('backup-hours'),    // 备份频率输入框（小时）
  max: document.getElementById('backup-max'),        // 最大快照数输入框
  test: document.getElementById('btn-test'),         // 测试连接按钮
  save: document.getElementById('btn-save'),       // 保存设置按钮
  backupNow: document.getElementById('btn-backup-now'), // 立即备份按钮
  checkCloud: document.getElementById('btn-check-cloud'), // 检查云端更新按钮
  refresh: document.getElementById('btn-refresh-list'), // 刷新备份列表按钮
  list: document.getElementById('backup-list'),     // 备份历史列表容器
  importBookmarks: document.getElementById('btn-import-bookmarks'), // 导入书签按钮
  bgUrl: document.getElementById('bg-url'),          // 背景图片URL输入框
  bgSave: document.getElementById('btn-bg-save'),    // 保存背景按钮
  webdavStatusBadge: document.getElementById('webdav-status-badge'),
  backupStatusBadge: document.getElementById('backup-status-badge'),
  historySummary: document.getElementById('history-summary'),
  bgPreview: document.getElementById('bg-preview'),
  bgPreviewText: document.getElementById('bg-preview-text'),
  summarySyncValue: document.getElementById('summary-sync-value'),
  summarySyncMeta: document.getElementById('summary-sync-meta'),
  summarySyncBadge: document.getElementById('summary-sync-badge'),
  summaryBackupValue: document.getElementById('summary-backup-value'),
  summaryBackupMeta: document.getElementById('summary-backup-meta'),
  summaryBackupBadge: document.getElementById('summary-backup-badge'),
  summaryLatestValue: document.getElementById('summary-latest-value'),
  summaryLatestMeta: document.getElementById('summary-latest-meta'),
  summaryLatestBadge: document.getElementById('summary-latest-badge'),
  summaryLanguageValue: document.getElementById('summary-language-value'),
  summaryLanguageMeta: document.getElementById('summary-language-meta'),
  summaryLanguageBadge: document.getElementById('summary-language-badge'),
  syncHostValue: document.getElementById('sync-host-value'),
  syncAccessValue: document.getElementById('sync-access-value'),
  syncClientValue: document.getElementById('sync-client-value'),
  backupIntervalValue: document.getElementById('backup-interval-value'),
  backupRetentionValue: document.getElementById('backup-retention-value'),
  backupLatestValue: document.getElementById('backup-latest-value'),
  toolsAvailabilityBadge: document.getElementById('tools-availability-badge'),
  toolsAvailabilityValue: document.getElementById('tools-availability-value'),
  toolsEnhancementValue: document.getElementById('tools-enhancement-value'),
  syncPanel: document.getElementById('panel-sync'),
  backupPanel: document.getElementById('panel-backup'),
  appearancePanel: document.getElementById('panel-appearance'),
  toolsPanel: document.getElementById('panel-tools'),
  historyPanel: document.getElementById('panel-history')
};

const viewState = {
  settings: null,
  data: null,
  latestBackup: null,
  backupCount: 0,
  connectionStatus: 'notConfigured',
  connectionError: '',
  isExtensionMode: typeof chrome !== 'undefined' && !!chrome?.bookmarks
};

function setStatusChip(el, text, tone = 'neutral') {
  if (!el) return;
  el.className = `status-chip status-${tone}`;
  el.textContent = text;
}

function setPanelTone(el, tone = 'neutral') {
  if (!el) return;
  el.dataset.tone = tone;
}

function getLocaleLabel(locale) {
  return locale === 'zh-CN' ? t('locale.zhCN') : t('locale.en');
}

function getLocaleModeLabel(mode) {
  if (mode === 'zh-CN') return t('locale.zhCN');
  if (mode === 'en') return t('locale.en');
  return t('locale.auto');
}

function getWebdavHost(url) {
  try {
    return new URL(url).host;
  } catch (e) {
    return url || '';
  }
}

function getBackupTypeLabel(fileName) {
  if (fileName.includes('_sync_backup_')) return t('options.backupTypeSync');
  if (fileName.includes('_schedule_')) return t('common.scheduled');
  if (fileName.includes('_user_')) return t('common.manual');
  if (fileName.includes('_handle_')) return t('common.auto');
  return t('options.backupTypeSnapshot');
}

function renderEmptyHistory(message, detail = '') {
  els.list.innerHTML = '';

  const item = document.createElement('li');
  item.className = 'options-empty-state glass';

  const title = document.createElement('div');
  title.className = 'options-empty-title';
  title.textContent = message;

  item.appendChild(title);

  if (detail) {
    const desc = document.createElement('div');
    desc.className = 'options-empty-desc';
    desc.textContent = detail;
    item.appendChild(desc);
  }

  els.list.appendChild(item);
}

function renderBackgroundPreview() {
  if (!els.bgPreview || !els.bgPreviewText) return;

  const backgroundUrl = viewState.data?.backgroundImage?.trim();
  if (backgroundUrl) {
    els.bgPreview.style.backgroundImage = `url("${backgroundUrl}")`;
    els.bgPreviewText.textContent = t('options.previewCustomBackground');
  } else {
    els.bgPreview.style.backgroundImage = '';
    els.bgPreviewText.textContent = t('options.previewDefaultBackground');
  }
}

function getSyncPresentation() {
  const hasConfig = Boolean(viewState.settings?.webdav?.url);
  const host = getWebdavHost(viewState.settings?.webdav?.url || '');

  if (!hasConfig) {
    return {
      tone: 'neutral',
      text: t('options.statusNotConfigured'),
      meta: t('options.summarySyncMetaEmpty')
    };
  }

  switch (viewState.connectionStatus) {
    case 'checking':
      return {
        tone: 'info',
        text: t('options.statusChecking'),
        meta: t('options.summarySyncMetaChecking', { host })
      };
    case 'readWrite':
      return {
        tone: 'success',
        text: t('options.statusReadWrite'),
        meta: t('options.summarySyncMetaReadWrite', { host })
      };
    case 'readOnly':
      return {
        tone: 'warn',
        text: t('options.statusReadOnly'),
        meta: t('options.summarySyncMetaReadOnly', { host })
      };
    case 'failed':
      return {
        tone: 'danger',
        text: t('options.statusFailed'),
        meta: viewState.connectionError || t('options.summarySyncMetaFailed', { host })
      };
    default:
      return {
        tone: 'info',
        text: t('options.statusConfigured'),
        meta: t('options.summarySyncMetaConfigured', { host })
      };
  }
}

function getBackupPresentation() {
  const enabled = Boolean(viewState.settings?.backup?.enabled);
  const hours = viewState.settings?.backup?.frequencyHours ?? 4;

  return enabled
    ? {
        tone: 'success',
        text: t('options.statusEnabled'),
        meta: t('options.summaryBackupMetaEnabled', { hours })
      }
    : {
        tone: 'neutral',
        text: t('options.statusDisabled'),
        meta: t('options.summaryBackupMetaDisabled')
      };
}

function getLatestBackupPresentation() {
  if (!viewState.settings?.webdav?.url) {
    return {
      tone: 'neutral',
      text: t('options.noBackups'),
      badge: t('options.statusNotConfigured'),
      meta: t('options.historyAwaitingConfig')
    };
  }

  if (!viewState.latestBackup) {
    return {
      tone: 'neutral',
      text: t('options.noBackups'),
      badge: t('options.noBackups'),
      meta: t('options.summaryLatestMetaEmpty')
    };
  }

  return {
    tone: 'info',
    text: formatDateTime(viewState.latestBackup.lastmod),
    badge: getBackupTypeLabel(viewState.latestBackup.name),
    meta: t('options.summaryLatestMetaCount', { count: viewState.backupCount })
  };
}

function getLanguagePresentation() {
  const mode = viewState.settings?.locale?.mode || 'auto';
  const resolved = resolveLocale(mode);
  const resolvedLabel = getLocaleLabel(resolved);

  return {
    tone: mode === 'auto' ? 'info' : 'neutral',
    text: getLocaleModeLabel(mode),
    meta: mode === 'auto'
      ? t('options.summaryLanguageMetaAuto', { locale: resolvedLabel })
      : t('options.summaryLanguageMetaManual', { locale: resolvedLabel })
  };
}

function renderDashboard() {
  if (!viewState.settings) return;

  const sync = getSyncPresentation();
  const backup = getBackupPresentation();
  const latest = getLatestBackupPresentation();
  const language = getLanguagePresentation();

  setStatusChip(els.webdavStatusBadge, sync.text, sync.tone);
  setStatusChip(els.summarySyncBadge, sync.text, sync.tone);
  els.summarySyncValue.textContent = sync.text;
  els.summarySyncMeta.textContent = sync.meta;

  setStatusChip(els.backupStatusBadge, backup.text, backup.tone);
  setStatusChip(els.summaryBackupBadge, backup.text, backup.tone);
  els.summaryBackupValue.textContent = backup.text;
  els.summaryBackupMeta.textContent = backup.meta;

  setStatusChip(els.summaryLatestBadge, latest.badge, latest.tone);
  els.summaryLatestValue.textContent = latest.text;
  els.summaryLatestMeta.textContent = latest.meta;

  setStatusChip(els.summaryLanguageBadge, language.text, language.tone);
  els.summaryLanguageValue.textContent = language.text;
  els.summaryLanguageMeta.textContent = language.meta;

  els.syncHostValue.textContent = getWebdavHost(viewState.settings?.webdav?.url || '') || t('options.metricValuePending');
  els.syncAccessValue.textContent = sync.text;
  els.syncClientValue.textContent = viewState.settings?.client?.identifier || t('options.metricValuePending');
  els.backupIntervalValue.textContent = `${viewState.settings?.backup?.frequencyHours ?? 4}h`;
  els.backupRetentionValue.textContent = String(viewState.settings?.backup?.maxSnapshots ?? 100);
  els.backupLatestValue.textContent = viewState.latestBackup ? formatDateTime(viewState.latestBackup.lastmod) : t('options.noBackups');

  const toolsMode = viewState.isExtensionMode ? t('options.statusExtensionMode') : t('options.statusWebMode');
  const toolsTone = viewState.isExtensionMode ? 'info' : 'warn';
  setStatusChip(els.toolsAvailabilityBadge, toolsMode, toolsTone);
  els.toolsAvailabilityValue.textContent = toolsMode;
  els.toolsEnhancementValue.textContent = viewState.isExtensionMode
    ? t('options.metricEnhancementEnabled')
    : t('options.metricEnhancementLimited');

  setPanelTone(els.syncPanel, sync.tone);
  setPanelTone(els.backupPanel, backup.tone);
  setPanelTone(els.appearancePanel, viewState.data?.backgroundImage?.trim() ? 'info' : 'neutral');
  setPanelTone(els.toolsPanel, toolsTone);
  setPanelTone(els.historyPanel, viewState.backupCount > 0 ? 'info' : (viewState.settings?.webdav?.url ? 'neutral' : 'warn'));

  els.historySummary.textContent = viewState.backupCount > 0
    ? t('options.historyCount', { count: viewState.backupCount })
    : (viewState.settings?.webdav?.url ? t('options.noBackups') : t('options.historyAwaitingConfig'));

  renderBackgroundPreview();
}

// 初始化页面
await init();

// 开发者工具函数 - 在控制台中可以调用
window.clearWebdavPermissions = async function() {
  const url = els.url.value;
  if (!url) {
    console.log('请先输入WebDAV URL');
    return;
  }
  return await removeWebdavPermissions(url);
};

// 测试函数 - 直接显示书签导入完成弹窗
window.testImportResultDialog = function() {
  const testStats = {
    foldersCount: 5,
    bookmarksCount: 42,
    enhancedBookmarksCount: 35
  };
  
  const testImportResult = {
    stats: {
      successful: 35,
      failed: 7,
      processed: 42,
      cached: 10
    }
  };
  
  showImportResultDialog(testStats, testImportResult);
};

/**
 * 页面初始化函数
 * 1. 从存储中读取当前配置并填充表单
 * 2. 绑定所有交互事件
 * 3. 加载备份历史列表
 */
async function init() {
  await initPageI18n();

  // 导入生成客户端标识的函数
  const { generateClientIdentifier } = await import('./storage.js');
  
  // 读取当前存储的设置和数据
  const { settings, data } = await readAll();
  
  // 填充WebDAV配置
  els.url.value = settings.webdav?.url || '';
  els.username.value = settings.webdav?.username || '';
  els.password.value = settings.webdav?.password || '';
  
  // 填充客户端标识，如果不存在则生成新的并保存
  let clientIdentifier = settings.client?.identifier;
  if (!clientIdentifier) {
    clientIdentifier = generateClientIdentifier();
    const updatedSettings = {
      ...settings,
      client: { ...settings.client, identifier: clientIdentifier }
    };
    await writeSettings(updatedSettings);
  }
  els.clientIdentifier.value = clientIdentifier;
  els.language.value = settings.locale?.mode || 'auto';
  
  // 填充自动备份配置
  els.enabled.checked = !!settings.backup?.enabled;
  els.hours.value = settings.backup?.frequencyHours ?? 4;
  els.max.value = settings.backup?.maxSnapshots ?? 100;
  
  // 填充背景图片配置
  // 只有当用户真正设置了背景图片时才显示，否则显示为空（不显示系统默认URL）
  els.bgUrl.value = (data.backgroundImage && data.backgroundImage.trim()) || '';
  els.bgUrl.placeholder = t('options.backgroundUrlHint');

  viewState.settings = settings;
  viewState.data = data;
  viewState.connectionStatus = settings.webdav?.url ? 'configured' : 'notConfigured';
  viewState.connectionError = '';
  renderDashboard();

  // 绑定事件监听器
  bind();
  
  // 加载备份历史列表
  await refreshList();
}

/**
 * 绑定所有交互事件
 * 为页面中的所有按钮和输入框添加事件监听
 */
function bind() {
  // 返回主页按钮
  els.backHome?.addEventListener('click', () => {
    // 打开扩展的新标签页（index.html）
    window.open('index.html', '_self');
  });

  // 客户端标识输入框实时验证
  els.clientIdentifier?.addEventListener('input', (e) => {
    // 移除下划线
    const value = e.target.value.replace(/_/g, '');
    if (value !== e.target.value) {
      e.target.value = value;
      // 可以添加一个提示
      e.target.style.borderColor = '#ff6b6b';
      setTimeout(() => {
        e.target.style.borderColor = '';
      }, 1000);
    }
  });

  const updateDraftBackupSummary = () => {
    if (!viewState.settings) return;
    viewState.settings = {
      ...viewState.settings,
      backup: {
        ...viewState.settings.backup,
        enabled: els.enabled.checked,
        frequencyHours: Number(els.hours.value) || 4,
        maxSnapshots: Math.max(1, Number(els.max.value) || 100)
      }
    };
    renderDashboard();
  };

  els.enabled?.addEventListener('change', updateDraftBackupSummary);
  els.hours?.addEventListener('input', updateDraftBackupSummary);
  els.max?.addEventListener('input', updateDraftBackupSummary);

  els.language?.addEventListener('change', async (e) => {
    const { settings } = await readAll();
    const nextSettings = {
      ...settings,
      locale: {
        mode: e.target.value || 'auto'
      }
    };

    await writeSettings(nextSettings);
    viewState.settings = nextSettings;
    setCurrentLocale(resolveLocale(nextSettings.locale.mode));
    await initPageI18n();
    els.bgUrl.placeholder = t('options.backgroundUrlHint');
    renderDashboard();
    await refreshList();
  });

  /**
   * 保存设置按钮点击事件
   * 收集表单数据并保存到存储中
   */
  els.save.addEventListener('click', async () => {
    try {
      // 如果设置了WebDAV URL，需要申请相关权限
      const webdavUrl = normalizeUrl(els.url.value);
      if (webdavUrl && webdavUrl.trim()) {
        // 申请访问外部URL的权限
        const hasPermission = await requestWebdavPermissions(webdavUrl);
        if (!hasPermission) {
          toast(t('options.webdavPermissionRequired'));
          return;
        }
      }

      // 构建新的设置对象
      const { settings: currentSettings } = await readAll();
      const next = {
        ...currentSettings,
        webdav: { 
          url: webdavUrl, 
          username: els.username.value, 
          password: els.password.value 
        },
        backup: { 
          enabled: els.enabled.checked, 
          frequencyHours: Number(els.hours.value) || 4, 
          maxSnapshots: Math.max(1, Number(els.max.value) || 100) 
        },
        client: {
          identifier: (els.clientIdentifier.value || '').trim() || 'MYTAB'
        },
        locale: {
          mode: els.language.value || currentSettings.locale?.mode || 'auto'
        }
      };
      
      // 保存到存储
      await writeSettings(next);
      viewState.settings = next;
      viewState.connectionStatus = next.webdav?.url ? 'configured' : 'notConfigured';
      viewState.connectionError = '';
      renderDashboard();
      
      // 清除WebDAV验证缓存，因为配置可能已更改
      try {
        await chrome.runtime.sendMessage({ type: 'webdav:clear-cache' });
      } catch (e) {
        // 忽略清除缓存的错误
      }
      
      toast(t('options.saved'));
      
    } catch (error) {
      console.error('保存设置失败:', error);
      toast(t('options.saveFailed', { message: error.message || error }));
    }
  });

  /**
   * 测试连接按钮点击事件
   * 测试WebDAV服务器连接是否可用
   */
  els.test.addEventListener('click', async () => {
    const config = { 
      url: normalizeUrl(els.url.value), 
      username: els.username.value, 
      password: els.password.value 
    };
    
    try {
      if (!config.url) {
        viewState.connectionStatus = 'notConfigured';
        viewState.connectionError = '';
        renderDashboard();
        toast(`❌ ${t('webdav.notConfigured')}`);
        return;
      }

      const webdavUrl = normalizeUrl(els.url.value);
      if (webdavUrl && webdavUrl.trim()) {
        // 申请访问外部URL的权限
        const hasPermission = await requestWebdavPermissions(webdavUrl);
        if (!hasPermission) {
          toast(t('options.webdavPermissionRequired'));
          return;
        }
      }

      viewState.connectionStatus = config.url ? 'checking' : 'notConfigured';
      viewState.connectionError = '';
      renderDashboard();
      toast(t('options.testingConnection'));
      const res = await chrome.runtime.sendMessage({ type: 'webdav:test', config });
      
      if (res?.ok) {
        if (res.canWrite) {
          viewState.connectionStatus = 'readWrite';
          toast(t('options.connectionSuccessReadWrite'));
        } else {
          viewState.connectionStatus = 'readOnly';
          toast(t('options.connectionSuccessReadOnly'));
        }
      } else {
        viewState.connectionStatus = 'failed';
        viewState.connectionError = res?.error || t('options.connectionFailed');
        toast(`❌ ${res?.error || t('options.connectionFailed')}`);
      }
      renderDashboard();
    } catch (e) {
      viewState.connectionStatus = 'failed';
      viewState.connectionError = e.message || String(e);
      renderDashboard();
      toast(t('options.testException', { message: e.message }));
    }
  });

  /**
   * 立即备份按钮点击事件
   * 手动触发数据备份到WebDAV服务器
   */
  els.backupNow.addEventListener('click', async () => {
    try {
      // 显示加载状态
      els.backupNow.disabled = true;
      const oldText = els.backupNow.textContent;
      els.backupNow.textContent = t('options.backupRunning');
      
      toast(t('options.backupStarted'));
      const res = await chrome.runtime.sendMessage({ type: 'backup:manual' });
      
      if (res?.ok) {
        toast(t('options.backupCompleted'));
        await refreshList(); // 刷新备份列表
      } else {
        toast(t('options.operationFailed', { message: res?.error || '' }));
      }
      
      // 恢复按钮状态
      els.backupNow.textContent = oldText;
      els.backupNow.disabled = false;
    } catch (e) {
      els.backupNow.disabled = false;
      els.backupNow.textContent = t('options.backupNow');
      toast(t('options.operationFailed', { message: String(e?.message || e) }));
    }
  });

  /**
   * 检查云端更新按钮点击事件
   * 检查WebDAV服务器上是否有更新的备份数据
   */
  els.checkCloud.addEventListener('click', async () => {
    try {
      // 显示加载状态
      els.checkCloud.disabled = true;
      const oldText = els.checkCloud.textContent;
      els.checkCloud.textContent = t('options.checkingCloud');
      
      // 请求后台检查云端数据
      const res = await chrome.runtime.sendMessage({ type: 'cloud:manual-check' });
      if (!res?.ok) {
        throw new Error(res?.error || t('options.checkFailed'));
      }
      
      if (!res.result) {
        toast(t('options.webdavOrBackupDisabled'));
        return;
      }
      
      if (!res.result.hasNewerData) {
        toast(t('options.noCloudUpdates'));
        return;
      }
      
      // 发现更新数据，询问用户是否同步
      const { cloudFile, cloudTime, localTime } = res.result;
      const shouldSync = confirm(t('options.syncConfirm', {
        fileName: cloudFile.name,
        cloudTime,
        localTime
      }));
      
      if (shouldSync) {
        // 执行同步
        const syncRes = await chrome.runtime.sendMessage({ 
          type: 'cloud:sync', 
          fileName: cloudFile.name 
        });
        
        if (syncRes?.ok) {
          toast(t('options.syncSuccess'));
          await refreshList(); // 刷新备份列表
        } else {
          throw new Error(syncRes?.error || t('home.syncFailedFallback'));
        }
      }
    } catch (e) {
      toast(t('options.actionFailed', { message: String(e?.message || e) }));
    } finally {
      els.checkCloud.disabled = false;
      els.checkCloud.textContent = t('options.checkCloudUpdates');
    }
  });

  // 刷新备份列表按钮
  els.refresh.addEventListener('click', refreshList);

  /**
   * 导入书签按钮点击事件
   * 导入浏览器书签到本插件中
   */
  els.importBookmarks.addEventListener('click', async () => {
    await handleImportBookmarks();
  });

  /**
   * 保存背景图片按钮点击事件
   * 保存用户设置的背景图片URL
   */
  els.bgSave.addEventListener('click', async () => {
    const { data } = await readAll();
    data.backgroundImage = els.bgUrl.value.trim();
    await writeData(data);
    viewState.data = data;
    renderDashboard();
    toast(t('options.backgroundSaved'));
  });
}

/**
 * 刷新备份历史列表
 * 从WebDAV服务器获取备份文件列表并显示
 */
async function refreshList() {
  if (!viewState.settings?.webdav?.url) {
    viewState.latestBackup = null;
    viewState.backupCount = 0;
    renderDashboard();
    renderEmptyHistory(t('options.noBackups'), t('options.historyAwaitingConfig'));
    return;
  }

  try {
    renderEmptyHistory(t('common.loading'));
    
    // 请求后台获取备份列表
    const res = await chrome.runtime.sendMessage({ type: 'backup:list' });
    if (!res?.ok) throw new Error(res?.error || '');
    
    const items = (res.list || []).slice().sort((a, b) => b.lastmod - a.lastmod);
    viewState.latestBackup = items[0] || null;
    viewState.backupCount = items.length;
    renderDashboard();

    els.list.innerHTML = '';
    
    // 处理空列表情况
    if (items.length === 0) {
      renderEmptyHistory(t('options.noBackups'), t('options.summaryLatestMetaEmpty'));
      return;
    }
    
    // 渲染备份列表
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'glass';

      const mainDiv = document.createElement('div');
      mainDiv.className = 'backup-item-main';

      const headDiv = document.createElement('div');
      headDiv.className = 'backup-item-head';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'backup-item-name';
      nameSpan.textContent = item.name;

      const tagSpan = document.createElement('span');
      tagSpan.className = 'backup-tag';
      tagSpan.textContent = getBackupTypeLabel(item.name);

      headDiv.appendChild(nameSpan);
      headDiv.appendChild(tagSpan);
      mainDiv.appendChild(headDiv);

      const footerDiv = document.createElement('div');
      footerDiv.className = 'backup-item-footer';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'backup-date';
      dateSpan.textContent = formatDateTime(item.lastmod);

      const btn = document.createElement('button');
      btn.className = 'mini-btn restore-btn';
      btn.textContent = t('common.restore');
      
      /**
       * 恢复按钮点击事件
       * 从指定备份文件恢复数据
       */
      btn.addEventListener('click', async () => {
        if (!confirm(t('options.restoreConfirm'))) return;
        const r = await chrome.runtime.sendMessage({ 
          type: 'backup:restore', 
          name: item.name 
        });
        if (r?.ok) {
          alert(t('options.restored'));
        } else {
          alert(t('options.restoreFailed', { message: r?.error || '' }));
        }
      });

      footerDiv.appendChild(dateSpan);
      footerDiv.appendChild(btn);
      
      li.appendChild(mainDiv);
      li.appendChild(footerDiv);

      els.list.appendChild(li);
    });
  } catch (e) {
    viewState.latestBackup = null;
    viewState.backupCount = 0;
    renderDashboard();
    renderEmptyHistory(t('options.loadFailed', { message: String(e?.message || e) }));
  }
}

/**
 * URL规范化函数
 * 确保WebDAV URL以斜杠结尾
 * @param {string} u - 原始URL
 * @returns {string} - 规范化后的URL
 */
function normalizeUrl(u) {
  if (!u) return '';
  if (!/\/ $/.test(u)) return u + '/';
  return u;
}

/**
 * 轻量级提示函数
 * 显示一个自动消失的提示消息
 * @param {string} text - 提示文本
 * @param {number} duration - 显示时长（毫秒）
 */
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

/**
 * ===========================================
 * 书签导入功能
 * ===========================================
 */

/**
 * 显示导入选项对话框
 * @returns {Promise<Object|null>} 导入选项或null（用户取消）
 */
async function showImportOptionsDialog() {
  return new Promise((resolve) => {
    // 创建遮罩层
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    // 创建对话框容器
    const modal = document.createElement('div');
    modal.className = 'modal';

    // 创建对话框面板
    const panel = document.createElement('div');
    panel.className = 'panel glass';

    // 创建内容区域
    const inner = document.createElement('div');
    inner.className = 'inner';

    // 标题
    const title = document.createElement('h3');
    title.textContent = t('options.importOptions');
    title.style.margin = '0 0 20px 0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--text)';


    // 增强导入选项 - 陶瓷拟态风格
    const enhancedOption = document.createElement('label');
    enhancedOption.className = 'choice-btn';
    enhancedOption.style.display = 'flex';
    enhancedOption.style.flexDirection = 'row';
    enhancedOption.style.alignItems = 'flex-start';
    enhancedOption.style.justifyContent = 'flex-start';
    enhancedOption.style.textAlign = 'left';
    enhancedOption.style.padding = '16px';
    enhancedOption.style.marginBottom = '12px';
    enhancedOption.style.cursor = 'pointer';
    enhancedOption.style.gap = '12px';

    const enhancedRadio = document.createElement('input');
    enhancedRadio.type = 'radio';
    enhancedRadio.name = 'importMode';
    enhancedRadio.value = 'enhanced';
    enhancedRadio.checked = true;
    enhancedRadio.style.marginTop = '2px';

    const enhancedLabel = document.createElement('div');
    enhancedLabel.style.flex = '1';
    enhancedLabel.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <span style="font-size: 20px;">🚀</span>
        <strong style="font-size: 15px; color: var(--text);">${t('options.enhancedImportRecommended')}</strong>
      </div>
      <div style="font-size: 15px; color: var(--text-dim); line-height: 1.5;">
        • ${t('options.enhancedImportLine1')}<br>
        • ${t('options.enhancedImportLine2')}<br>
        • ${t('options.enhancedImportLine3')}
      </div>
    `;

    enhancedOption.appendChild(enhancedRadio);
    enhancedOption.appendChild(enhancedLabel);

    // 快速导入选项 - 陶瓷拟态风格
    const quickOption = document.createElement('label');
    quickOption.className = 'choice-btn';
    quickOption.style.display = 'flex';
    quickOption.style.flexDirection = 'row';
    quickOption.style.alignItems = 'flex-start';
    quickOption.style.justifyContent = 'flex-start';
    quickOption.style.textAlign = 'left';
    quickOption.style.padding = '16px';
    quickOption.style.marginBottom = '20px';
    quickOption.style.cursor = 'pointer';
    quickOption.style.gap = '12px';

    const quickRadio = document.createElement('input');
    quickRadio.type = 'radio';
    quickRadio.name = 'importMode';
    quickRadio.value = 'quick';
    quickRadio.style.marginTop = '2px';

    const quickLabel = document.createElement('div');
    quickLabel.style.flex = '1';
    quickLabel.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <span style="font-size: 20px;">⚡</span>
        <strong style="font-size: 15px; color: var(--text);">${t('options.quickImport')}</strong>
      </div>
      <div style="font-size: 15px; color: var(--text-dim); line-height: 1.5;">
        • ${t('options.quickImportLine1')}<br>
        • ${t('options.quickImportLine2')}<br>
      </div>
    `;

    quickOption.appendChild(quickRadio);
    quickOption.appendChild(quickLabel);

    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'dialog-actions';

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost-btn';
    cancelBtn.textContent = t('common.cancel');
    cancelBtn.style.minWidth = '80px';

    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'primary-btn';
    confirmBtn.textContent = t('options.startImport');
    confirmBtn.style.minWidth = '100px';

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);

    // 组装DOM结构
    inner.appendChild(title);
    inner.appendChild(enhancedOption);
    inner.appendChild(quickOption);
    inner.appendChild(buttonContainer);

    panel.appendChild(inner);
    modal.appendChild(panel);

    // 创建完整的对话框结构
    const dialog = document.createElement('div');
    dialog.appendChild(backdrop);
    dialog.appendChild(modal);

    // 添加到页面
    document.body.appendChild(dialog);
    document.body.style.overflow = 'hidden';

    // 清理函数
    const cleanup = () => {
      document.body.style.overflow = '';
      dialog.remove();
    };

    // 取消按钮事件
    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    // 确认按钮事件
    confirmBtn.addEventListener('click', () => {
      const selectedMode = document.querySelector('input[name="importMode"]:checked')?.value || 'enhanced';
      cleanup();
      resolve({
        enhanced: selectedMode === 'enhanced'
      });
    });

    // 点击遮罩层取消
    backdrop.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
  });
}

/**
 * 显示导入结果对话框
 * @param {Object} stats - 导入统计信息
 * @param {Object} importResult - 导入结果详情
 */
function showImportResultDialog(stats, importResult = null) {
  // 创建遮罩层
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  // 创建对话框容器
  const modal = document.createElement('div');
  modal.className = 'modal';

  // 创建对话框面板 - 简洁玻璃拟态风格
  const panel = document.createElement('div');
  panel.className = 'panel glass';
  panel.style.cssText = `
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    padding: 24px;
    max-width: 400px;
    margin: 20px;
  `;

  // 创建内容区域
  const inner = document.createElement('div');
  inner.className = 'inner';
  inner.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  `;


  // 标题
  const title = document.createElement('h3');
  title.textContent = t('options.importCompleted');
  title.style.cssText = `
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
    text-align: center;
  `;

  // 统计信息容器
  const statsContainer = document.createElement('div');
  statsContainer.style.cssText = `
    background: rgba(255, 255, 255, 0.5);
    border-radius: 12px;
    padding: 16px;
    width: 100%;
  `;

  const foldersCount = stats.foldersCount || 0;
  const bookmarksCount = stats.bookmarksCount || 0;

  // 基本统计
  const basicStats = document.createElement('div');
  basicStats.style.cssText = `
    display: flex;
    justify-content: space-around;
    margin-bottom: 16px;
  `;

  basicStats.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${foldersCount}</div>
      <div style="font-size: 13px; color: var(--text-dim);">${t('options.folders')}</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: var(--accent);">${bookmarksCount}</div>
      <div style="font-size: 13px; color: var(--text-dim);">${t('options.bookmarks')}</div>
    </div>
  `;

  // 添加"导入结果"标题
  const importResultTitle = document.createElement('div');
  importResultTitle.textContent = t('options.importResult');
  importResultTitle.style.cssText = `
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 10px;
    text-align: center;
  `;

  // 增强统计（如果有）
  if (importResult && importResult.stats) {
    const { successful = 0, failed = 0, processed = 0 } = importResult.stats;
    
    if (processed > 0) {
      const enhancedStats = document.createElement('div');
      enhancedStats.style.cssText = `
        border-top: 1px solid rgba(0, 0, 0, 0.1);
        padding-top: 12px;
        text-align: center;
      `;

      enhancedStats.innerHTML = `
        <div style="font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 10px;">${t('options.enhancedResult')}</div>
        <div style="display: flex; justify-content: space-around;">
          <div style="color: #10b981;">${successful} ${t('common.success')}</div>
          <div style="color: #ef4444;">${failed} ${t('common.failed')}</div>
          <div>${Math.round((successful / processed) * 100)}%</div>
        </div>
      `;
      statsContainer.appendChild(importResultTitle);
      statsContainer.appendChild(basicStats);
      statsContainer.appendChild(enhancedStats);
    } else {
      statsContainer.appendChild(basicStats);
    }
  } else {
    statsContainer.appendChild(basicStats);
  }


  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'primary-btn';
  closeBtn.textContent = t('options.completed');
  closeBtn.style.cssText = `
    background: var(--primary);
    border: none;
    border-radius: 8px;
    padding: 10px 24px;
    color: white;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    min-width: 100px;
  `;



  // 组装DOM结构
  inner.appendChild(title);
  inner.appendChild(statsContainer);
  inner.appendChild(closeBtn);

  panel.appendChild(inner);
  modal.appendChild(panel);

  // 创建完整的对话框结构
  const dialog = document.createElement('div');
  dialog.appendChild(backdrop);
  dialog.appendChild(modal);

  // 添加到页面
  document.body.appendChild(dialog);
  document.body.style.overflow = 'hidden';

  // 清理函数
  const cleanup = () => {
    document.body.style.overflow = '';
    dialog.remove();
  };

  // 关闭按钮事件
  closeBtn.addEventListener('click', cleanup);

  // 点击遮罩层关闭
  backdrop.addEventListener('click', cleanup);
}

/**
 * 处理书签导入按钮点击事件
 * 检测当前环境，在插件模式下导入书签，在web模式下显示提示
 */
async function handleImportBookmarks() {
  try {
    // 检测是否为插件模式
    const isExtensionMode = !window.__MYTAB_USE_PROXY__;
    
    console.log('书签导入 - 环境检测:', {
      isExtensionMode,
      hasChrome: !!window.chrome,
      hasBookmarksAPI: !!(window.chrome && window.chrome.bookmarks),
      hasPermissionsAPI: !!(window.chrome && window.chrome.permissions)
    });
    
    if (!isExtensionMode) {
      // Web模式下不支持书签导入
      alert(t('options.extensionModeOnly'));
      return;
    }

    // 检查Chrome扩展环境
    if (!window.chrome) {
      toast(t('options.extensionUnavailable'), 3000);
      return;
    }

    // 检查书签API是否可用
    if (!chrome.bookmarks) {
      toast(t('options.bookmarksApiUnavailable'), 3000);
      console.error('书签API不可用，请检查manifest.json中的权限配置');
      return;
    }

    // 显示导入选项对话框
    const importOptions = await showImportOptionsDialog();
    if (!importOptions) {
      // 用户取消了导入
      return;
    }

    // 显示加载状态
    els.importBookmarks.disabled = true;
    const oldText = els.importBookmarks.textContent;
    els.importBookmarks.textContent = t('options.importing');
    
    toast(t('options.readingBookmarks'));

    // 读取浏览器书签
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // 使用选择的导入模式转换书签数据
    const importedData = await convertBookmarksToMyTab(bookmarkTree, importOptions);
    
    if (importedData.folders.length === 0) {
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = oldText;
      
      toast(t('options.noBookmarksFound'), 3000);
      return;
    }

    // 执行导入
    console.log('开始执行书签导入...');
    try {
      await performBookmarkImport(importedData);
      console.log('书签导入完成');
      
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = oldText;
      
      // 显示导入结果
      showImportResultDialog(importedData.stats, importedData.importResult);
      
    } catch (importError) {
      console.error('执行导入时出错:', importError);
      
      // 恢复按钮状态
      els.importBookmarks.disabled = false;
      els.importBookmarks.textContent = oldText;
      
      // 显示错误提示
      const errorMsg = importError.message || importError;
      toast(t('options.importProcessError', { message: errorMsg }), 4000);
    }
    
  } catch (error) {
    console.error('书签导入失败:', error);
    
    // 恢复按钮状态
    els.importBookmarks.disabled = false;
    els.importBookmarks.textContent = t('options.importBrowserBookmarks');
    
    // 显示错误提示
    const errorMsg = error.message || error;
    toast(t('options.importFailed', { message: errorMsg }), 4000);
  }
}

/**
 * 清除WebDAV权限（开发测试用）
 * @param {string} url - WebDAV服务器URL
 * @returns {Promise<boolean>} 是否成功清除
 */
async function removeWebdavPermissions(url) {
  try {
    if (!window.chrome || !chrome.permissions) {
      console.warn('Chrome权限API不可用');
      return false;
    }

    // 解析URL获取域名
    let hostname;
    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
    } catch (e) {
      console.error('无效的URL:', url);
      return false;
    }

    // 构建权限对象
    const permissions = {
      origins: [`*://${hostname}/*`]
    };

    // 移除权限
    const removed = await chrome.permissions.remove(permissions);
    
    if (removed) {
      console.log('WebDAV权限已清除:', hostname);
      toast(t('options.permissionsCleared'));
    } else {
      console.log('权限清除失败或权限不存在:', hostname);
      toast(t('options.clearPermissionsFailed'));
    }
    
    return removed;
  } catch (error) {
    console.error('清除权限失败:', error);
    toast(t('options.clearPermissionsError', { message: error.message }));
    return false;
  }
}

/**
 * 请求WebDAV相关权限
 * @param {string} url - WebDAV服务器URL
 * @returns {Promise<boolean>} 是否获得权限
 */
async function requestWebdavPermissions(url) {
  try {
    // 检测是否为插件模式
    const isExtensionMode = !window.__MYTAB_USE_PROXY__;
    
    if (!isExtensionMode) {
      // Web模式下不需要权限申请
      return true;
    }

    // 检查Chrome扩展环境
    if (!window.chrome || !chrome.permissions) {
      console.warn('Chrome权限API不可用');
      return true; // 在非扩展环境下允许继续
    }

    // 解析URL获取域名
    let hostname;
    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
    } catch (e) {
      console.error('无效的URL:', url);
      return false;
    }

    // 构建权限请求
    const permissions = {
      origins: [`*://${hostname}/*`]
    };

    // 检查是否已有权限
    const hasPermission = await chrome.permissions.contains(permissions);
    
    if (hasPermission) {
      return true;
    }
    
    // 直接申请权限，不使用前置确认对话框
    // 这样可以确保权限申请在用户手势上下文中进行
    console.log('申请WebDAV权限:', hostname);
    
    let granted;
    try {
      // 添加短暂延迟，确保用户操作完成
      await new Promise(resolve => setTimeout(resolve, 100));
      granted = await chrome.permissions.request(permissions);
    } catch (requestError) {
      console.error('权限申请异常:', requestError);
      // 如果权限申请抛出异常，可能是因为用户手势上下文丢失
      alert(t('options.permissionRequestFailed', { hostname }));
      return false;
    }
    
    if (granted) {
      console.log('WebDAV权限申请成功:', hostname);
      toast(t('options.permissionRequestGranted'));
    } else {
      console.log('WebDAV权限申请被拒绝:', hostname);
      // 提供更详细的失败说明
      alert(t('options.permissionRequestDenied', { hostname }));
    }
    
    return granted;
  } catch (error) {
    console.error('WebDAV权限请求失败:', error);
    alert(t('options.permissionRequestException', { message: error.message || error }));
    return false;
  }
}



/**
 * 将Chrome书签数据转换为MyTab格式（增强版）
 * 使用 EnhancedBookmarkImporter 自动获取网站标题和图标
 * @param {Array} bookmarkTree - Chrome书签树
 * @param {Object} options - 导入选项
 * @param {boolean} options.enhanced - 是否启用增强功能
 * @returns {Promise<Object>} 转换后的数据
 */
async function convertBookmarksToMyTab(bookmarkTree, options = { enhanced: true }) {
  const { generateId } = await import('./storage.js');
  const { EnhancedBookmarkImporter } = await import('./enhanced-bookmark-importer.js');
  const { ProgressDialog } = await import('./progress-dialog.js');
  
  const result = {
    folders: [],
    stats: {
      foldersCount: 0,
      bookmarksCount: 0,
      enhancedBookmarksCount: 0
    },
    importResult: null
  };

  // 创建进度对话框（仅在增强模式下显示）
  const progressDialog = options.enhanced ? new ProgressDialog() : null;
  let importer = null;

  try {
    // 从根节点开始转换，通常是 bookmarkTree[0]
    if (!bookmarkTree || bookmarkTree.length === 0) {
      return result;
    }

    const rootNode = bookmarkTree[0];
    console.log('读取到的根书签节点:', rootNode);
    
    if (!rootNode.children) {
      return result;
    }

    // 第一步：构建文件夹结构（不包含书签内容）
    const foldersToImport = [];
    const allBookmarks = []; // 收集所有书签用于批量增强
    
    // 处理每一个顶级文件夹
    for (const child of rootNode.children) {
      console.log('顶级文件夹/节点:', child.title, child);
      
      // 如果是系统文件夹（书签栏或其他书签）
      if (isSystemBookmarkFolder(child)) {
        // 创建一个新文件夹，使用系统文件夹名称
        const systemFolder = {
          id: generateId('f'),
          name: child.title,
          icon: '📁',
          type: 'folder',
          parentId: null,
          bookmarks: [],
          children: []
        };
        
        // 递归处理该系统文件夹下的所有内容
        const { bookmarks: folderBookmarks, subFolders } = await processBookmarkFolder(child, systemFolder.id, generateId);
        
        // 收集书签用于批量增强
        console.log(`系统文件夹 ${child.title} 收集到 ${folderBookmarks.length} 个书签`);
        folderBookmarks.forEach(bookmark => {
          console.log(`  - ${bookmark.title} (${bookmark.url}) -> 文件夹 ${bookmark.parentFolderId}`);
        });
        allBookmarks.push(...folderBookmarks);
        
        // 添加子文件夹
        systemFolder.children = subFolders;
        
        // 只有当有内容时才添加该文件夹
        if (folderBookmarks.length > 0 || subFolders.length > 0) {
          result.stats.foldersCount++;
          foldersToImport.push(systemFolder);
          
          // 暂时将书签引用存储，稍后会被增强后的书签替换
          systemFolder._bookmarkRefs = folderBookmarks;
        }
      } else {
        // 非系统文件夹，直接处理
        const { bookmarks: folderBookmarks, folder: convertedFolder } = await processBookmarkNode(child, null, generateId);
        
        if (convertedFolder) {
          console.log(`非系统文件夹 ${convertedFolder.name} 收集到 ${folderBookmarks.length} 个书签`);
          folderBookmarks.forEach(bookmark => {
            console.log(`  - ${bookmark.title} (${bookmark.url}) -> 文件夹 ${bookmark.parentFolderId}`);
          });
          allBookmarks.push(...folderBookmarks);
          foldersToImport.push(convertedFolder);
          convertedFolder._bookmarkRefs = folderBookmarks;
        }
      }
    }

    // 更新基础统计
    result.stats.bookmarksCount = allBookmarks.length;
    result.folders = foldersToImport;

    // 如果没有书签，直接返回
    if (allBookmarks.length === 0) {
      return result;
    }

    // 第二步：根据选项决定是否使用增强功能
    if (options.enhanced) {
      // 增强模式：使用 EnhancedBookmarkImporter 批量增强书签
      console.log(`开始增强 ${allBookmarks.length} 个书签...`);
      
      // 显示进度对话框
      progressDialog.show(allBookmarks.length, () => {
        if (importer) {
          importer.cancel();
        }
      });

      // 创建增强导入器
      importer = new EnhancedBookmarkImporter({
        concurrency: 6,
        timeout: 5000,
        onProgress: (progress) => {
          // 更新进度对话框，包含时间估算
          progressDialog.updateProgress(
            progress.processed || 0,
            progress.total || allBookmarks.length,
            progress.currentUrl || '',
            progress.timing
          );
          
          progressDialog.updateStats({
            successful: progress.successful || 0,
            failed: progress.failed || 0,
            processed: progress.processed || 0,
            cached: progress.cached || 0,
            errorsByType: progress.errorsByType,
            concurrencyAdjustments: progress.concurrencyAdjustments
          }, progress.timing);
        },
        onError: (error) => {
          console.warn('书签增强过程中出现错误:', error);
        }
      });

      // 执行批量增强，传入我们已经处理好的书签数据而不是原始的书签树
      const enhancementResult = await importer.importBookmarksFromList(allBookmarks);
      result.importResult = enhancementResult;
      
      if (enhancementResult.success) {
        // 增强成功，更新统计信息
        result.stats.enhancedBookmarksCount = enhancementResult.stats.successful || 0;
        
        // 创建增强书签的映射表（URL -> 增强书签）
        const enhancedBookmarkMap = new Map();
        console.log(`创建增强书签映射表，共 ${enhancementResult.bookmarks.length} 个增强书签`);
        for (const enhancedBookmark of enhancementResult.bookmarks) {
          if (enhancedBookmark.url) {
            enhancedBookmarkMap.set(enhancedBookmark.url, enhancedBookmark);
            console.log(`映射: ${enhancedBookmark.url} -> ${enhancedBookmark.title} (增强=${enhancedBookmark.enhanced})`);
          }
        }
        console.log(`增强书签映射表创建完成，共 ${enhancedBookmarkMap.size} 个条目`);
        
        // 第三步：将增强后的书签数据应用到文件夹结构中
        for (const folder of result.folders) {
          await applyEnhancedBookmarksToFolder(folder, enhancedBookmarkMap);
        }
        
        // 显示完成状态
        progressDialog.setCompleted({
          successful: enhancementResult.stats.successful || 0,
          failed: enhancementResult.stats.failed || 0,
          processed: enhancementResult.stats.processed || 0
        });
        
        console.log('书签增强完成:', enhancementResult.stats);
      } else {
        // 增强失败，使用原始书签数据
        console.warn('书签增强失败，使用原始数据:', enhancementResult.error);
        
        // 将原始书签应用到文件夹结构
        for (const folder of result.folders) {
          await applyOriginalBookmarksToFolder(folder);
        }
        
        progressDialog.setError(enhancementResult.error || t('import.enhancementProcessFailed'));
      }

      // 延迟关闭进度对话框，让用户看到结果
      setTimeout(() => {
        progressDialog.hide();
      }, 2000);
    } else {
      // 快速模式：直接使用原始书签数据
      console.log(`快速导入 ${allBookmarks.length} 个书签...`);
      
      // 将原始书签应用到文件夹结构
      for (const folder of result.folders) {
        await applyOriginalBookmarksToFolder(folder);
      }
      
      console.log('快速导入完成');
    }

  } catch (error) {
    console.error('书签转换过程中出现错误:', error);
    
    // 显示详细的错误状态（仅在增强模式下）
    if (progressDialog && progressDialog.visible) {
      let errorMessage = error.message || String(error);
      
      // 根据错误类型提供更友好的错误信息
      if (errorMessage.includes('网络错误') || errorMessage.includes('Failed to fetch')) {
        errorMessage = t('import.networkRetryMessage');
      } else if (errorMessage.includes('超时')) {
        errorMessage = t('import.timeoutRetryMessage');
      } else if (errorMessage.includes('权限')) {
        errorMessage = t('import.permissionRetryMessage');
      }
      
      progressDialog.setError(errorMessage);
      
      // 延长错误显示时间，让用户有足够时间阅读
      setTimeout(() => {
        progressDialog.hide();
      }, 5000);
    }
    
    throw error;
  } finally {
    // 清理资源
    if (importer) {
      importer.destroy();
    }
  }

  return result;
}

/**
 * 检查是否为系统书签文件夹
 * @param {Object} node - 书签节点
 * @returns {boolean} 是否为系统文件夹
 */
function isSystemBookmarkFolder(node) {
  // Chrome系统文件夹的特殊标识
  const systemFolderIds = ['1', '2']; // 1=书签栏, 2=其他书签
  const systemFolderTitles = [
    'Bookmarks bar', '书签栏', '书签列',
    'Other bookmarks', '其他书签', '其他書籤',
    'Mobile bookmarks', '手机书签', '移动设备书签'
  ];
  
  return systemFolderIds.includes(node.id) || 
         systemFolderTitles.includes(node.title);
}

/**
 * 递归处理书签文件夹，提取所有书签和子文件夹
 * @param {Object} folderNode - Chrome书签文件夹节点
 * @param {string} parentId - 父文件夹ID
 * @param {Function} generateId - ID生成函数
 * @returns {Promise<Object>} 包含书签数组和子文件夹数组的对象
 */
async function processBookmarkFolder(folderNode, parentId, generateId) {
  const bookmarks = [];
  const subFolders = [];
  
  if (!folderNode.children) {
    return { bookmarks, subFolders };
  }
  
  for (const child of folderNode.children) {
    if (child.url) {
      // 是书签
      bookmarks.push({
        id: generateId('b'),
        title: child.title || t('import.defaultUntitledBookmark'),
        url: child.url,
        dateAdded: child.dateAdded || Date.now(),
        parentFolderId: parentId
      });
    } else if (child.children) {
      // 是子文件夹
      const subFolder = {
        id: generateId('f'),
        name: child.title || t('import.defaultUnnamedFolder'),
        icon: '📁',
        type: 'folder',
        parentId: parentId,
        bookmarks: [],
        children: []
      };
      
      // 递归处理子文件夹
      const { bookmarks: subBookmarks, subFolders: subSubFolders } = await processBookmarkFolder(child, subFolder.id, generateId);
      
      // 收集所有书签（包括子文件夹中的）
      bookmarks.push(...subBookmarks);
      
      // 设置子文件夹的子文件夹
      subFolder.children = subSubFolders;
      subFolder._bookmarkRefs = subBookmarks.filter(b => b.parentFolderId === subFolder.id);
      
      // 只有包含内容的文件夹才被保留
      if (subBookmarks.length > 0 || subSubFolders.length > 0) {
        subFolders.push(subFolder);
      }
    }
  }
  
  return { bookmarks, subFolders };
}

/**
 * 处理单个书签节点（可能是文件夹或书签）
 * @param {Object} node - Chrome书签节点
 * @param {string|null} parentId - 父文件夹ID
 * @param {Function} generateId - ID生成函数
 * @returns {Promise<Object>} 包含书签数组和文件夹对象的结果
 */
async function processBookmarkNode(node, parentId, generateId) {
  if (node.url) {
    // 是书签
    const bookmark = {
      id: generateId('b'),
      title: node.title || t('import.defaultUntitledBookmark'),
      url: node.url,
      dateAdded: node.dateAdded || Date.now(),
      parentFolderId: parentId
    };
    return { bookmarks: [bookmark], folder: null };
  } else if (node.children) {
    // 是文件夹
    const folder = {
      id: generateId('f'),
      name: node.title || t('import.defaultUnnamedFolder'),
      icon: '📁',
      type: 'folder',
      parentId: parentId,
      bookmarks: [],
      children: []
    };
    
    // 递归处理文件夹内容
    const { bookmarks, subFolders } = await processBookmarkFolder(node, folder.id, generateId);
    
    folder.children = subFolders;
    
    // 只有包含内容的文件夹才被保留
    if (bookmarks.length > 0 || subFolders.length > 0) {
      return { bookmarks, folder };
    }
  }
  
  return { bookmarks: [], folder: null };
}

/**
 * 将增强后的书签数据应用到文件夹结构中
 * @param {Object} folder - 文件夹对象
 * @param {Map} enhancedBookmarkMap - 增强书签映射表（URL -> 增强书签）
 */
async function applyEnhancedBookmarksToFolder(folder, enhancedBookmarkMap) {
  console.log(`处理文件夹: ${folder.name} (ID: ${folder.id})`);
  
  // 处理当前文件夹的书签
  if (folder._bookmarkRefs) {
    console.log(`文件夹 ${folder.name} 有 ${folder._bookmarkRefs.length} 个书签引用`);
    
    const filteredBookmarks = folder._bookmarkRefs.filter(bookmark => {
      const matches = bookmark.parentFolderId === folder.id;
      console.log(`书签 ${bookmark.title} (${bookmark.url}) parentFolderId=${bookmark.parentFolderId}, folder.id=${folder.id}, 匹配=${matches}`);
      return matches;
    });
    
    console.log(`过滤后有 ${filteredBookmarks.length} 个匹配的书签`);
    
    folder.bookmarks = filteredBookmarks.map(originalBookmark => {
      const enhanced = enhancedBookmarkMap.get(originalBookmark.url);
      if (enhanced) {
        console.log(`找到增强数据: ${originalBookmark.url} -> ${enhanced.title}`);
        // 使用增强后的数据，但保留原始的ID和文件夹关联
        const finalTitle = enhanced.title || enhanced.originalTitle || originalBookmark.title || t('import.defaultUntitledBookmark');
        return {
          ...enhanced,
          id: originalBookmark.id,
          parentFolderId: originalBookmark.parentFolderId,
          dateAdded: originalBookmark.dateAdded,
          // 确保标题不为空，如果增强后的标题为空，使用原始标题
          title: finalTitle
        };
      } else {
        console.log(`未找到增强数据，使用原始书签: ${originalBookmark.url}`);
        // 如果没有增强数据，使用原始书签
        return originalBookmark;
      }
    });
    
    console.log(`文件夹 ${folder.name} 最终有 ${folder.bookmarks.length} 个书签`);
    
    // 清理临时引用
    delete folder._bookmarkRefs;
  }
  
  // 递归处理子文件夹
  if (folder.children) {
    for (const subFolder of folder.children) {
      await applyEnhancedBookmarksToFolder(subFolder, enhancedBookmarkMap);
    }
  }
}

/**
 * 将原始书签数据应用到文件夹结构中（增强失败时的备选方案）
 * @param {Object} folder - 文件夹对象
 */
async function applyOriginalBookmarksToFolder(folder) {
  console.log(`[快速模式] 处理文件夹: ${folder.name} (ID: ${folder.id})`);
  
  // 处理当前文件夹的书签
  if (folder._bookmarkRefs) {
    console.log(`[快速模式] 文件夹 ${folder.name} 有 ${folder._bookmarkRefs.length} 个书签引用`);
    
    const filteredBookmarks = folder._bookmarkRefs.filter(bookmark => {
      const matches = bookmark.parentFolderId === folder.id;
      console.log(`[快速模式] 书签 ${bookmark.title} (${bookmark.url}) parentFolderId=${bookmark.parentFolderId}, folder.id=${folder.id}, 匹配=${matches}`);
      return matches;
    });
    
    folder.bookmarks = filteredBookmarks;
    console.log(`[快速模式] 文件夹 ${folder.name} 最终有 ${folder.bookmarks.length} 个书签`);
    
    delete folder._bookmarkRefs;
  }
  
  // 递归处理子文件夹
  if (folder.children) {
    for (const subFolder of folder.children) {
      await applyOriginalBookmarksToFolder(subFolder);
    }
  }
}

/**
 * 执行书签导入
 * @param {Object} importedData - 要导入的数据
 */
async function performBookmarkImport(importedData) {
  console.log('开始读取现有数据...');
  // 读取现有数据
  const { data } = await readAll();
  console.log('现有数据:', { foldersCount: data.folders?.length || 0 });
  
  // 确保 folders 是数组
  if (!Array.isArray(data.folders)) {
    console.warn('data.folders 不是数组，初始化为空数组');
    data.folders = [];
  }
  
  console.log('将要导入的数据:', { foldersCount: importedData.folders?.length || 0 });
  
  // 将导入的文件夹添加到现有数据中
  data.folders = data.folders.concat(importedData.folders);
  console.log('合并后的数据:', { foldersCount: data.folders.length });
  
  // 更新修改时间
  data.lastModified = Date.now();
  
  // 保存数据
  console.log('开始保存数据...');
  await writeData(data);
  console.log('数据保存完成');
  
  // 通知数据变更（如果在插件模式下）
  try {
    console.log('发送数据变更通知...');
    // 设置超时，避免无限等待
    const sendMessageWithTimeout = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve({ timeout: true });
      }, 1000); // 1秒超时
      
      chrome.runtime.sendMessage({ type: 'data:changed' })
        .then(response => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
    
    const response = await sendMessageWithTimeout;
    if (response?.timeout) {
      console.log('数据变更通知已发送（未等待响应）');
    } else {
      console.log('数据变更通知发送成功', response);
    }
  } catch (error) {
    // 在web模式下可能会失败，忽略错误
    console.log('数据变更通知失败（正常）:', error);
  }
}
