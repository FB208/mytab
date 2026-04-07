const MESSAGES = {
  'zh-CN': {
    common: {
      appName: 'MyTab',
      home: '首页',
      settings: '设置',
      save: '保存',
      cancel: '取消',
      confirm: '确定',
      close: '关闭',
      rename: '重命名',
      move: '移动',
      delete: '删除',
      edit: '编辑',
      restore: '恢复',
      bookmark: '书签',
      folder: '文件夹',
      loading: '加载中...',
      unknownError: '未知错误',
      success: '成功',
      failed: '失败',
      auto: '自动',
      manual: '手动',
      scheduled: '定时',
      yes: '是',
      no: '否'
    },
    locale: {
      auto: '跟随浏览器',
      zhCN: '简体中文',
      en: 'English'
    },
    manifest: {
      extensionName: 'MyTab - WebDAV 同步书签面板',
      extensionDescription: '一个简洁、美观、轻量、免费的新标签页面板，支持自定义 WebDAV 备份与历史记录恢复，确保你永远不会丢失自己的收藏。'
    },
    pageTitle: {
      home: 'MyTab',
      options: 'MyTab 设置'
    },
    home: {
      settingsTitle: '设置',
      searchPlaceholder: '搜索书签名称、网址或备注...',
      clearSearch: '清空搜索',
      addBookmark: '添加书签',
      editBookmark: '编辑书签',
      url: '网址',
      nameOptional: '名称（可选）',
      displayName: '显示名称',
      remarkOptional: '备注（可选）',
      remarkPlaceholder: '添加一条备注，悬浮书签时会显示',
      iconMode: '图标模式',
      monoIcon: '单色图标',
      preview: '预览',
      faviconUrlOptional: 'Favicon 地址（可留空自动）',
      autoFetch: '自动获取',
      fetchingIconAndTitle: '正在获取图标和标题...',
      optionalIcons: '可选图标（点击选择）',
      letter: '字母',
      backgroundColor: '背景色',
      inputTitle: '输入',
      inputPlaceholder: '请输入',
      confirmTitle: '确认',
      searchResults: '搜索结果',
      chooseAddType: '选择要添加的类型',
      moveTo: '移动到',
      rootFolder: '根目录',
      topLevelFolder: '一级文件夹',
      moveFolder: '移动文件夹',
      moveBookmark: '移动书签',
      moveSuccess: '✅ 移动成功',
      moveFailed: '❌ 移动失败',
      bookmarkCannotMoveRoot: '❌ 书签不能移动到根目录',
      skipGuide: '跳过引导',
      nextStep: '下一步',
      finishGuide: '完成引导',
      dataVersion: '数据版本: {time}',
      dataVersionUnknown: '数据版本: --',
      rootBreadcrumb: '🏠 首页',
      backToParent: '返回上级',
      addItemCard: '添加',
      selectFolderFirst: '请先选择一个文件夹',
      newTopFolder: '新建一级文件夹',
      newSubfolder: '新建子文件夹',
      folderName: '文件夹名称',
      confirmDeleteFolder: '确认删除该文件夹及其内容？',
      confirmDeleteBookmark: '删除该书签？',
      urlRequired: '请输入网址',
      urlRequiredBeforeAnalyze: '请先输入网址',
      invalidUrl: '请输入有效的网址',
      aiAnalyzeTitle: 'AI分析网址',
      syncingBlocked: '⚠️ 正在同步数据，请稍候完成后再操作',
      syncFoundTitle: '发现云端更新',
      syncFoundText: '检测到云端有更新的数据：',
      cloudFile: '云端文件：',
      cloudTime: '云端时间：',
      localTime: '本地时间：',
      syncNotice: '注意：同步前会自动备份当前本地数据，确保数据安全。',
      later: '稍后再说',
      syncNow: '立即同步',
      syncing: '⚠️ 正在同步中，请稍候...',
      syncingCloudData: '正在同步云端数据...',
      syncingData: '正在同步数据...',
      syncSuccess: '✅ 同步成功！数据已更新',
      syncFailedFallback: '同步失败',
      syncFailed: '❌ 同步失败：{message}',
      pleaseWaitOperation: '请勿关闭页面或进行其他操作',
      firstFolderTitle: '创建你的第一个文件夹',
      firstFolderContent: '点击这个按钮来创建你的第一个文件夹，用于组织管理你的书签。',
      chooseFolderTitle: '选择文件夹',
      chooseFolderContent: '点击文件夹可以选中它，选中后就可以在文件夹中添加书签了。',
      addBookmarkTitle: '添加书签',
      addBookmarkContent: '在文件夹中添加你喜欢的网站书签，方便快速访问。',
      settingsTitleGuide: '设置页面',
      settingsContentGuide: '在设置页面可以配置WebDAV同步、导入浏览器书签等高级功能。',
      searchTitleGuide: '搜索功能',
      searchContentGuide: '使用搜索框可以快速找到你需要的书签。',
      guideStep: '步骤 {current} / {total}',
      rootMoveDisabled: '一级文件夹不能移动到根目录',
      rootMoveEnabled: '移动到根目录（成为一级文件夹）',
      levelFolder: '{level}级文件夹',
      doubleClickToExpand: '双击展开'
    },
    options: {
      heroEyebrow: '设置工作台',
      heroSubtitle: '统一管理同步、备份恢复、数据导入与界面个性化。',
      overviewSyncTitle: '同步状态',
      overviewBackupTitle: '备份策略',
      overviewLatestTitle: '最近备份',
      overviewLanguageTitle: '当前语言',
      metricHost: '目标主机',
      metricAccess: '访问模式',
      metricClient: '客户端标识',
      metricInterval: '快照频率',
      metricRetention: '保留上限',
      metricLatest: '最近快照',
      metricAvailability: '当前环境',
      metricEnhancement: '导入增强',
      metricValuePending: '待配置',
      metricEnhancementEnabled: '标题与图标增强',
      metricEnhancementLimited: '基础导入可用',
      panelSyncKicker: '同步中心',
      panelSyncTitle: '同步与连接',
      panelSyncDesc: '连接 WebDAV 后，备份、历史恢复和云端同步会统一从这里生效。',
      webdavFootnote: '仅在保存配置时申请站点权限，用于测试连接与上传下载备份。',
      panelBackupKicker: '备份策略',
      panelBackupTitle: '备份与恢复策略',
      panelBackupDesc: '把自动快照、手动备份和云端检查集中在一起，保持你的数据始终可回滚。',
      backupAutoTitle: '自动备份',
      backupAutoDesc: '所有数据变更仍会自动防抖备份，这里决定是否额外生成定时快照。',
      panelAppearanceKicker: '个性化',
      panelAppearanceTitle: '界面与个性化',
      panelAppearanceDesc: '语言和背景会立即影响首页与设置页体验。',
      backgroundPreview: '背景预览',
      previewDefaultBackground: '当前使用默认背景',
      previewCustomBackground: '已应用自定义背景',
      panelToolsKicker: '数据工具',
      panelToolsTitle: '导入与整理',
      panelToolsDesc: '导入浏览器书签，并在增强流程中补齐标题与图标。',
      importToolPoint1: '完整保留浏览器书签的文件夹层级',
      importToolPoint2: '可选择增强导入，自动补齐标题与图标',
      importToolPoint3: '导入过程中持续展示进度与结果',
      panelHistoryKicker: '备份历史',
      panelHistoryTitle: '历史快照',
      panelHistoryDesc: '所有可恢复快照统一展示在这里，方便快速回滚到任意时间点。',
      title: '设置',
      backHome: '返回首页',
      webdav: 'WebDAV',
      username: '用户名',
      password: '密码',
      clientIdentifier: '客户端标识',
      clientIdentifierPlaceholder: '不能含下划线，建议简短',
      language: '语言',
      testConnection: '测试连接',
      scheduledBackup: '定时备份',
      backupEnabled: '开启定时备份(所有操作均会自动备份，可以不开启定时备份)',
      frequencyHours: '频率（小时）',
      historyLimit: '历史上限',
      backupNow: '立即备份',
      checkCloudUpdates: '检查云端更新',
      dataImport: '数据导入',
      importBrowserBookmarks: '导入浏览器书签',
      importFeatureTitle: '功能说明',
      importFeatureDesc: '将浏览器书签导入到本插件中，完整保持文件夹层级结构。导入过程中会显示详细的进度信息，包括当前处理的网站和完成百分比。',
      backgroundImage: '背景图片',
      backgroundUrlPlaceholder: '输入图片 URL',
      saveBackground: '保存背景',
      historyWebdav: '历史记录（WebDAV）',
      refreshList: '刷新列表',
      backgroundUrlHint: '请输入背景图片Url（留空则使用默认背景）',
      webdavPermissionRequired: '需要权限才能保存WebDAV配置',
      saved: '已保存',
      saveFailed: '保存失败: {message}',
      testingConnection: '连接测试中...',
      connectionSuccessReadWrite: '✅ 连接成功，可读写',
      connectionSuccessReadOnly: '✅ 连接成功，只读权限',
      connectionFailed: '连接失败',
      testException: '❌ 测试异常：{message}',
      backupRunning: '备份中…',
      backupStarted: '开始备份',
      backupCompleted: '备份完成',
      operationFailed: '失败: {message}',
      checkingCloud: '检查中…',
      checkFailed: '检查失败',
      webdavOrBackupDisabled: '未配置WebDAV或备份未启用',
      noCloudUpdates: '云端没有更新的数据',
      syncConfirm: '发现云端更新数据：\n\n云端文件：{fileName}\n云端时间：{cloudTime}\n本地时间：{localTime}\n\n是否立即同步？（同步前会自动备份当前本地数据）',
      syncSuccess: '同步成功！',
      statusNotConfigured: '未配置',
      statusConfigured: '已配置',
      statusReadWrite: '可读写',
      statusReadOnly: '只读',
      statusChecking: '检测中',
      statusFailed: '连接失败',
      statusEnabled: '已开启',
      statusDisabled: '已关闭',
      statusExtensionMode: '扩展模式',
      statusWebMode: '网页模式',
      summarySyncMetaEmpty: '填写 WebDAV 后启用云端能力',
      summarySyncMetaConfigured: '已配置连接目标 {host}',
      summarySyncMetaChecking: '正在验证 {host} 的连通性',
      summarySyncMetaReadWrite: '已连接到 {host}，可上传与恢复',
      summarySyncMetaReadOnly: '已连接到 {host}，但当前仅有读取权限',
      summarySyncMetaFailed: '最近一次连接 {host} 失败',
      summaryBackupMetaEnabled: '每 {hours} 小时自动生成新快照',
      summaryBackupMetaDisabled: '仅保留手动与操作触发的备份',
      summaryLatestMetaEmpty: '新的快照生成后会显示在这里',
      summaryLatestMetaCount: '当前共有 {count} 个可恢复快照',
      summaryLanguageMetaAuto: '当前跟随{locale}',
      summaryLanguageMetaManual: '界面固定为{locale}',
      historyAwaitingConfig: '配置 WebDAV 后这里会显示可恢复快照',
      historyCount: '{count} 个快照',
      backupTypeSync: '同步前备份',
      backupTypeSnapshot: '快照',
      actionFailed: '操作失败: {message}',
      backgroundSaved: '背景地址已保存',
      noBackups: '暂无备份',
      restoreConfirm: '确认从该快照恢复？',
      restored: '已恢复',
      restoreFailed: '恢复失败: {message}',
      loadFailed: '加载失败: {message}',
      importOptions: '书签导入选项',
      enhancedImportRecommended: '增强导入（推荐）',
      enhancedImportLine1: '自动获取网站真实标题和图标',
      enhancedImportLine2: '并发处理，效率更高',
      enhancedImportLine3: '网络异常时自动降级',
      quickImport: '快速导入',
      quickImportLine1: '仅导入文件夹和书签',
      quickImportLine2: '速度很快',
      startImport: '开始导入',
      importCompleted: '书签导入完成',
      folders: '文件夹',
      bookmarks: '书签',
      importResult: '导入结果',
      enhancedResult: '增强结果',
      completed: '完成',
      extensionModeOnly: '书签导入功能仅在 Chrome 扩展模式下可用。\n\n如需使用此功能，请：\n1. 安装 MyTab Chrome 扩展\n2. 在扩展中打开设置页面\n3. 使用导入功能',
      extensionUnavailable: '✗ Chrome 扩展环境不可用，请确保在扩展中使用此功能',
      bookmarksApiUnavailable: '✗ 书签 API 不可用，请重新加载扩展或检查权限设置',
      importing: '导入中...',
      readingBookmarks: '正在读取书签数据...',
      noBookmarksFound: '没有找到可导入的书签，请检查浏览器是否有书签数据',
      importProcessError: '✗ 导入过程中发生错误: {message}\n请检查网络连接或稍后重试',
      importFailed: '✗ 书签导入失败: {message}\n请检查扩展权限和网络连接',
      permissionsCleared: '✓ 权限已清除，可以重新测试',
      clearPermissionsFailed: '权限清除失败或权限不存在',
      clearPermissionsError: '清除权限失败: {message}',
      permissionRequestFailed: '权限申请失败\n\n无法申请访问 {hostname} 的权限。\n\n可能的原因：\n• 浏览器阻止了权限申请\n• 权限申请超时\n\n解决方法：\n• 请重新点击保存按钮\n• 检查浏览器是否阻止了弹窗\n• 在扩展管理页面手动添加网站权限',
      permissionRequestGranted: '✓ 权限申请成功，可以正常使用WebDAV功能',
      permissionRequestDenied: '权限申请被拒绝\n\n您拒绝了访问 {hostname} 的权限申请。\n\n如需使用WebDAV功能，请：\n• 重新点击保存按钮并在弹窗中选择"允许"\n• 或在扩展管理页面手动添加网站权限\n\n权限用途：\n• 测试服务器连接状态\n• 上传和下载备份数据',
      permissionRequestException: '权限申请出现异常\n\n错误信息：{message}\n\n请尝试：\n• 重新加载扩展\n• 重启浏览器\n• 检查扩展是否正常安装'
    },
    progress: {
      title: '正在导入书签 - 增强模式',
      initialStatus: '正在初始化导入过程...',
      initialStats: '增强成功: 0 | 增强失败: 0 | 缓存命中: 0',
      notice: '提示：失败的书签也会被导入，失败仅代表该书签无法通过互联网访问，没有获取到标题和图标',
      estimatedRemaining: '预计剩余: {time}',
      statsSummary: '成功: {successful} | 失败: {failed}',
      statsCache: '缓存: {cached}',
      statsProcessed: '已处理: {processed}',
      statsConcurrency: '并发: {concurrency}',
      errorTimeout: '超时:{count}',
      errorNetwork: '网络:{count}',
      error4xx: '4xx:{count}',
      error5xx: '5xx:{count}',
      errorCors: 'CORS:{count}',
      completedIn: '导入完成！用时 {seconds} 秒',
      errorSummaryTitle: '增强失败统计：',
      requestTimeout: '请求超时: {count}个',
      networkError: '网络错误: {count}个',
      clientError4xx: '客户端错误(4xx): {count}个',
      serverError5xx: '服务器错误(5xx): {count}个',
      corsLimited: '跨域限制: {count}个',
      sslError: 'SSL错误: {count}个',
      parseError: '解析错误: {count}个',
      otherError: '其他错误: {count}个',
      errorPrefix: '错误: {message}'
    },
    import: {
      defaultUntitledBookmark: '无标题书签',
      defaultUnnamedFolder: '无名文件夹',
      networkUnavailableSkip: '网络不可用，跳过增强功能',
      networkUnavailableAll: '网络连接不可用，跳过所有增强功能',
      operationCancelled: '操作已取消',
      enhancementProcessFailed: '增强过程失败',
      networkRetryMessage: '网络连接失败，请检查网络连接后重试',
      timeoutRetryMessage: '请求超时，可能是网络较慢或目标网站响应缓慢',
      permissionRetryMessage: '权限不足，请确保已授予必要的浏览器权限'
    },
    notification: {
      backupSuccessTitle: 'MyTab 备份成功',
      backupFailureTitle: 'MyTab 备份失败',
      backupCompleted: '{type}备份完成'
    },
    webdav: {
      notConfigured: '未配置 WebDAV URL',
      invalidUrl: 'URL格式无效',
      authFailed: '认证失败：用户名或密码错误',
      permissionDenied: '权限拒绝：无访问权限',
      serverError: '服务器错误：{status} {statusText}',
      networkError: '网络错误：无法连接到服务器',
      webdavAuthFailed: 'WebDAV认证失败：用户名或密码错误',
      webdavPermissionDenied: 'WebDAV权限拒绝：无目录访问权限',
      webdavError: 'WebDAV错误：{status}',
      listFailed: '列举失败: {status}',
      timestampParseFailed: '无法解析文件名时间戳',
      secondsDiff: '{seconds}秒',
      notEnabled: 'WebDAV未配置',
      requestTimeout: '请求超时 ({ms}ms)'
    },
    shim: {
      notificationFallback: '通知'
    }
  },
  en: {
    common: {
      appName: 'MyTab',
      home: 'Home',
      settings: 'Settings',
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      close: 'Close',
      rename: 'Rename',
      move: 'Move',
      delete: 'Delete',
      edit: 'Edit',
      restore: 'Restore',
      bookmark: 'Bookmark',
      folder: 'Folder',
      loading: 'Loading...',
      unknownError: 'Unknown error',
      success: 'Success',
      failed: 'Failed',
      auto: 'Automatic',
      manual: 'Manual',
      scheduled: 'Scheduled',
      yes: 'Yes',
      no: 'No'
    },
    locale: {
      auto: 'Follow browser',
      zhCN: '简体中文',
      en: 'English'
    },
    manifest: {
      extensionName: 'MyTab - WebDAV Bookmark Dashboard',
      extensionDescription: 'A clean, beautiful, lightweight, and free new tab dashboard with custom WebDAV backup and history restore so your bookmarks never get lost.'
    },
    pageTitle: {
      home: 'MyTab',
      options: 'MyTab Settings'
    },
    home: {
      settingsTitle: 'Settings',
      searchPlaceholder: 'Search bookmark names, URLs, or notes...',
      clearSearch: 'Clear search',
      addBookmark: 'Add Bookmark',
      editBookmark: 'Edit Bookmark',
      url: 'URL',
      nameOptional: 'Name (optional)',
      displayName: 'Display name',
      remarkOptional: 'Note (optional)',
      remarkPlaceholder: 'Add a note to show when hovering the bookmark',
      iconMode: 'Icon mode',
      monoIcon: 'Monochrome icon',
      preview: 'Preview',
      faviconUrlOptional: 'Favicon URL (leave empty for auto)',
      autoFetch: 'Auto fetch',
      fetchingIconAndTitle: 'Fetching icon and title...',
      optionalIcons: 'Available icons (click to choose)',
      letter: 'Letter',
      backgroundColor: 'Background color',
      inputTitle: 'Input',
      inputPlaceholder: 'Please enter',
      confirmTitle: 'Confirm',
      searchResults: 'Search Results',
      chooseAddType: 'Choose what to add',
      moveTo: 'Move To',
      rootFolder: 'Root',
      topLevelFolder: 'Top-level folder',
      moveFolder: 'Move Folder',
      moveBookmark: 'Move Bookmark',
      moveSuccess: '✅ Moved successfully',
      moveFailed: '❌ Move failed',
      bookmarkCannotMoveRoot: '❌ Bookmarks cannot be moved to root',
      skipGuide: 'Skip guide',
      nextStep: 'Next',
      finishGuide: 'Finish',
      dataVersion: 'Data version: {time}',
      dataVersionUnknown: 'Data version: --',
      rootBreadcrumb: '🏠 Home',
      backToParent: 'Go back',
      addItemCard: 'Add',
      selectFolderFirst: 'Please select a folder first',
      newTopFolder: 'New top-level folder',
      newSubfolder: 'New subfolder',
      folderName: 'Folder name',
      confirmDeleteFolder: 'Delete this folder and all its contents?',
      confirmDeleteBookmark: 'Delete this bookmark?',
      urlRequired: 'Please enter a URL',
      urlRequiredBeforeAnalyze: 'Please enter a URL first',
      invalidUrl: 'Please enter a valid URL',
      aiAnalyzeTitle: 'Analyze URL with AI',
      syncingBlocked: '⚠️ Data is syncing. Please wait before making changes',
      syncFoundTitle: 'Cloud update found',
      syncFoundText: 'Newer data was found in the cloud:',
      cloudFile: 'Cloud file:',
      cloudTime: 'Cloud time:',
      localTime: 'Local time:',
      syncNotice: 'Note: your current local data will be backed up automatically before syncing.',
      later: 'Later',
      syncNow: 'Sync now',
      syncing: '⚠️ Sync in progress, please wait...',
      syncingCloudData: 'Syncing cloud data...',
      syncingData: 'Syncing data...',
      syncSuccess: '✅ Sync complete! Data updated',
      syncFailedFallback: 'Sync failed',
      syncFailed: '❌ Sync failed: {message}',
      pleaseWaitOperation: 'Please do not close the page or perform other actions',
      firstFolderTitle: 'Create your first folder',
      firstFolderContent: 'Click this button to create your first folder and organize your bookmarks.',
      chooseFolderTitle: 'Choose a folder',
      chooseFolderContent: 'Click a folder to select it, then you can add bookmarks inside it.',
      addBookmarkTitle: 'Add bookmarks',
      addBookmarkContent: 'Add your favorite websites to access them quickly.',
      settingsTitleGuide: 'Settings page',
      settingsContentGuide: 'Configure WebDAV sync, import browser bookmarks, and other advanced features here.',
      searchTitleGuide: 'Search',
      searchContentGuide: 'Use the search box to quickly find the bookmarks you need.',
      guideStep: 'Step {current} / {total}',
      rootMoveDisabled: 'Top-level folders cannot be moved to root',
      rootMoveEnabled: 'Move to root (make it top-level)',
      levelFolder: 'Level {level} folder',
      doubleClickToExpand: 'Double-click to expand'
    },
    options: {
      heroEyebrow: 'Control center',
      heroSubtitle: 'Manage sync, backup recovery, data import, and personalization in one place.',
      overviewSyncTitle: 'Sync status',
      overviewBackupTitle: 'Backup policy',
      overviewLatestTitle: 'Latest backup',
      overviewLanguageTitle: 'Language',
      metricHost: 'Target host',
      metricAccess: 'Access mode',
      metricClient: 'Client identifier',
      metricInterval: 'Snapshot interval',
      metricRetention: 'Retention',
      metricLatest: 'Latest snapshot',
      metricAvailability: 'Current environment',
      metricEnhancement: 'Import enhancement',
      metricValuePending: 'Pending',
      metricEnhancementEnabled: 'Title and icon enrichment',
      metricEnhancementLimited: 'Basic import only',
      panelSyncKicker: 'Sync center',
      panelSyncTitle: 'Sync & connection',
      panelSyncDesc: 'Once WebDAV is connected, backup, restore history, and cloud sync all run from here.',
      webdavFootnote: 'Site permission is requested only when saving the configuration, and is used for connection tests plus backup upload and download.',
      panelBackupKicker: 'Backup policy',
      panelBackupTitle: 'Backup & recovery policy',
      panelBackupDesc: 'Keep scheduled snapshots, manual backups, and cloud checks in one place so rollback always stays close at hand.',
      backupAutoTitle: 'Automatic snapshots',
      backupAutoDesc: 'Your data changes are still backed up with debounce. This switch controls whether extra scheduled snapshots are created.',
      panelAppearanceKicker: 'Personalization',
      panelAppearanceTitle: 'Interface & personalization',
      panelAppearanceDesc: 'Language and background changes immediately affect both the home page and settings experience.',
      backgroundPreview: 'Background preview',
      previewDefaultBackground: 'Using the default background',
      previewCustomBackground: 'Custom background applied',
      panelToolsKicker: 'Data tools',
      panelToolsTitle: 'Import & organize',
      panelToolsDesc: 'Bring in browser bookmarks and enrich them with titles and icons during the enhanced flow.',
      importToolPoint1: 'Preserve the full browser bookmark folder hierarchy',
      importToolPoint2: 'Choose enhanced import to automatically fill titles and icons',
      importToolPoint3: 'See progress and final results throughout the import',
      panelHistoryKicker: 'Backup history',
      panelHistoryTitle: 'Snapshot history',
      panelHistoryDesc: 'All recoverable snapshots appear here so you can roll back to any moment quickly.',
      title: 'Settings',
      backHome: 'Back to home',
      webdav: 'WebDAV',
      username: 'Username',
      password: 'Password',
      clientIdentifier: 'Client identifier',
      clientIdentifierPlaceholder: 'No underscores, keep it short',
      language: 'Language',
      testConnection: 'Test connection',
      scheduledBackup: 'Scheduled backup',
      backupEnabled: 'Enable scheduled backups (all changes are already auto-backed up, so this is optional)',
      frequencyHours: 'Frequency (hours)',
      historyLimit: 'History limit',
      backupNow: 'Back up now',
      checkCloudUpdates: 'Check cloud updates',
      dataImport: 'Data import',
      importBrowserBookmarks: 'Import browser bookmarks',
      importFeatureTitle: 'Feature overview',
      importFeatureDesc: 'Import browser bookmarks into this extension while keeping the full folder hierarchy intact. Detailed progress, including current site and completion percentage, is shown during import.',
      backgroundImage: 'Background image',
      backgroundUrlPlaceholder: 'Enter image URL',
      saveBackground: 'Save background',
      historyWebdav: 'History (WebDAV)',
      refreshList: 'Refresh list',
      backgroundUrlHint: 'Enter a background image URL (leave empty to use the default background)',
      webdavPermissionRequired: 'Permission is required to save the WebDAV configuration',
      saved: 'Saved',
      saveFailed: 'Save failed: {message}',
      testingConnection: 'Testing connection...',
      connectionSuccessReadWrite: '✅ Connected successfully with read/write access',
      connectionSuccessReadOnly: '✅ Connected successfully with read-only access',
      connectionFailed: 'Connection failed',
      testException: '❌ Test failed: {message}',
      backupRunning: 'Backing up…',
      backupStarted: 'Backup started',
      backupCompleted: 'Backup completed',
      operationFailed: 'Failed: {message}',
      checkingCloud: 'Checking…',
      checkFailed: 'Check failed',
      webdavOrBackupDisabled: 'WebDAV is not configured or backup is disabled',
      noCloudUpdates: 'No newer cloud data found',
      syncConfirm: 'Newer cloud data found:\n\nCloud file: {fileName}\nCloud time: {cloudTime}\nLocal time: {localTime}\n\nSync now? (Current local data will be backed up automatically first)',
      syncSuccess: 'Sync completed!',
      statusNotConfigured: 'Not configured',
      statusConfigured: 'Configured',
      statusReadWrite: 'Read & write',
      statusReadOnly: 'Read only',
      statusChecking: 'Checking',
      statusFailed: 'Failed',
      statusEnabled: 'Enabled',
      statusDisabled: 'Disabled',
      statusExtensionMode: 'Extension mode',
      statusWebMode: 'Web mode',
      summarySyncMetaEmpty: 'Set up WebDAV to unlock cloud backup and recovery',
      summarySyncMetaConfigured: 'Target configured: {host}',
      summarySyncMetaChecking: 'Checking connectivity to {host}',
      summarySyncMetaReadWrite: 'Connected to {host} with upload and restore access',
      summarySyncMetaReadOnly: 'Connected to {host}, but only read access is available',
      summarySyncMetaFailed: 'The most recent connection to {host} failed',
      summaryBackupMetaEnabled: 'A new snapshot is created every {hours} hours',
      summaryBackupMetaDisabled: 'Only manual and action-triggered backups are kept',
      summaryLatestMetaEmpty: 'New snapshots will appear here once they are created',
      summaryLatestMetaCount: '{count} recoverable snapshots are available',
      summaryLanguageMetaAuto: 'Currently following {locale}',
      summaryLanguageMetaManual: 'Interface is fixed to {locale}',
      historyAwaitingConfig: 'Configure WebDAV to show recoverable snapshots here',
      historyCount: '{count} snapshots',
      backupTypeSync: 'Pre-sync backup',
      backupTypeSnapshot: 'Snapshot',
      actionFailed: 'Action failed: {message}',
      backgroundSaved: 'Background URL saved',
      noBackups: 'No backups yet',
      restoreConfirm: 'Restore from this snapshot?',
      restored: 'Restored',
      restoreFailed: 'Restore failed: {message}',
      loadFailed: 'Load failed: {message}',
      importOptions: 'Bookmark import options',
      enhancedImportRecommended: 'Enhanced import (recommended)',
      enhancedImportLine1: 'Automatically fetch real website titles and icons',
      enhancedImportLine2: 'Concurrent processing for better speed',
      enhancedImportLine3: 'Automatically falls back on network issues',
      quickImport: 'Quick import',
      quickImportLine1: 'Import folders and bookmarks only',
      quickImportLine2: 'Fast and lightweight',
      startImport: 'Start import',
      importCompleted: 'Bookmark import completed',
      folders: 'Folders',
      bookmarks: 'Bookmarks',
      importResult: 'Import result',
      enhancedResult: 'Enhancement result',
      completed: 'Done',
      extensionModeOnly: 'Bookmark import is only available in Chrome extension mode.\n\nTo use this feature:\n1. Install the MyTab Chrome extension\n2. Open the settings page inside the extension\n3. Use the import feature there',
      extensionUnavailable: '✗ Chrome extension APIs are unavailable. Please use this feature inside the extension',
      bookmarksApiUnavailable: '✗ The bookmarks API is unavailable. Reload the extension or check permissions',
      importing: 'Importing...',
      readingBookmarks: 'Reading bookmark data...',
      noBookmarksFound: 'No bookmarks were found to import. Please check whether your browser has bookmark data',
      importProcessError: '✗ An error occurred during import: {message}\nPlease check your network connection and try again later',
      importFailed: '✗ Bookmark import failed: {message}\nPlease check extension permissions and network connectivity',
      permissionsCleared: '✓ Permissions cleared. You can test again now',
      clearPermissionsFailed: 'Failed to clear permission or permission was not present',
      clearPermissionsError: 'Failed to clear permission: {message}',
      permissionRequestFailed: 'Permission request failed\n\nUnable to request access to {hostname}.\n\nPossible reasons:\n• The browser blocked the permission prompt\n• The permission request timed out\n\nTry this:\n• Click Save again\n• Check whether the browser blocked the popup\n• Manually add site permissions on the extension management page',
      permissionRequestGranted: '✓ Permission granted. WebDAV is ready to use',
      permissionRequestDenied: 'Permission request denied\n\nYou denied access to {hostname}.\n\nTo use WebDAV:\n• Click Save again and choose "Allow" in the prompt\n• Or manually add site permissions on the extension management page\n\nThis permission is used to:\n• Test server connectivity\n• Upload and download backup data',
      permissionRequestException: 'Permission request failed unexpectedly\n\nError: {message}\n\nTry:\n• Reloading the extension\n• Restarting the browser\n• Checking whether the extension is installed correctly'
    },
    progress: {
      title: 'Importing bookmarks - enhanced mode',
      initialStatus: 'Initializing import...',
      initialStats: 'Enhanced: 0 | Failed: 0 | Cache hits: 0',
      notice: 'Note: failed bookmarks will still be imported. Failure only means the bookmark could not be reached online, so the title and icon could not be fetched.',
      estimatedRemaining: 'Estimated remaining: {time}',
      statsSummary: 'Success: {successful} | Failed: {failed}',
      statsCache: 'Cache: {cached}',
      statsProcessed: 'Processed: {processed}',
      statsConcurrency: 'Concurrency: {concurrency}',
      errorTimeout: 'Timeout:{count}',
      errorNetwork: 'Network:{count}',
      error4xx: '4xx:{count}',
      error5xx: '5xx:{count}',
      errorCors: 'CORS:{count}',
      completedIn: 'Import completed in {seconds}s',
      errorSummaryTitle: 'Enhancement failure summary:',
      requestTimeout: 'Request timeout: {count}',
      networkError: 'Network error: {count}',
      clientError4xx: 'Client error (4xx): {count}',
      serverError5xx: 'Server error (5xx): {count}',
      corsLimited: 'CORS limited: {count}',
      sslError: 'SSL error: {count}',
      parseError: 'Parse error: {count}',
      otherError: 'Other error: {count}',
      errorPrefix: 'Error: {message}'
    },
    import: {
      defaultUntitledBookmark: 'Untitled bookmark',
      defaultUnnamedFolder: 'Unnamed folder',
      networkUnavailableSkip: 'Network unavailable, skipping enhancement',
      networkUnavailableAll: 'Network unavailable, skipping all enhancements',
      operationCancelled: 'Operation cancelled',
      enhancementProcessFailed: 'Enhancement process failed',
      networkRetryMessage: 'Network request failed. Please check your connection and try again',
      timeoutRetryMessage: 'Request timed out. Your network may be slow or the target site may be responding slowly',
      permissionRetryMessage: 'Insufficient permissions. Please make sure the required browser permissions are granted'
    },
    notification: {
      backupSuccessTitle: 'MyTab Backup Succeeded',
      backupFailureTitle: 'MyTab Backup Failed',
      backupCompleted: '{type} backup completed'
    },
    webdav: {
      notConfigured: 'WebDAV URL is not configured',
      invalidUrl: 'Invalid URL format',
      authFailed: 'Authentication failed: incorrect username or password',
      permissionDenied: 'Permission denied: access is not allowed',
      serverError: 'Server error: {status} {statusText}',
      networkError: 'Network error: unable to reach the server',
      webdavAuthFailed: 'WebDAV authentication failed: incorrect username or password',
      webdavPermissionDenied: 'WebDAV permission denied: no directory access',
      webdavError: 'WebDAV error: {status}',
      listFailed: 'List failed: {status}',
      timestampParseFailed: 'Failed to parse timestamp from filename',
      secondsDiff: '{seconds}s',
      notEnabled: 'WebDAV is not configured',
      requestTimeout: 'Request timed out ({ms}ms)'
    },
    shim: {
      notificationFallback: 'Notification'
    }
  }
};

export const LOCALE_MODE_AUTO = 'auto';
export const SUPPORTED_LOCALES = ['zh-CN', 'en'];

let currentLocale = null;

function getMessageObject(locale) {
  return MESSAGES[normalizeLocale(locale)] || MESSAGES.en;
}

function getByPath(obj, path) {
  return path.split('.').reduce((value, key) => value?.[key], obj);
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    return value == null ? '' : String(value);
  });
}

export function normalizeLocale(locale) {
  const normalized = String(locale || '').toLowerCase();
  if (!normalized) return 'en';
  if (normalized.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function getBrowserLocale() {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
      return normalizeLocale(chrome.i18n.getUILanguage());
    }
  } catch (e) {}

  if (typeof navigator !== 'undefined') {
    return normalizeLocale(navigator.languages?.[0] || navigator.language || 'en');
  }

  return 'en';
}

export function resolveLocale(mode = LOCALE_MODE_AUTO) {
  if (mode && mode !== LOCALE_MODE_AUTO) {
    return normalizeLocale(mode);
  }
  return getBrowserLocale();
}

export function setCurrentLocale(locale) {
  currentLocale = normalizeLocale(locale);
  return currentLocale;
}

export function getCurrentLocaleSync() {
  return currentLocale || getBrowserLocale();
}

export async function getStoredLocaleMode() {
  try {
    const { settings } = await chrome.storage.local.get({ settings: {} });
    return settings?.locale?.mode || LOCALE_MODE_AUTO;
  } catch (e) {
    return LOCALE_MODE_AUTO;
  }
}

export async function getCurrentLocale() {
  return setCurrentLocale(resolveLocale(await getStoredLocaleMode()));
}

export function t(key, params = {}, locale = getCurrentLocaleSync()) {
  const message = getByPath(getMessageObject(locale), key) ?? getByPath(MESSAGES.en, key) ?? key;
  return interpolate(message, params);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTime(value, locale = getCurrentLocaleSync(), options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  const defaultOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };

  return new Intl.DateTimeFormat(locale, { ...defaultOptions, ...options }).format(date);
}

export function formatDuration(seconds, locale = getCurrentLocaleSync()) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (locale === 'zh-CN') {
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    if (minutes > 0) return `${minutes}分${secs}秒`;
    return `${secs}秒`;
  }

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function formatPercent(value, locale = getCurrentLocaleSync()) {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0
  }).format(value);
}

export function applyDocumentLanguage(locale = getCurrentLocaleSync()) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
  document.documentElement.dataset.locale = locale;
  document.documentElement.style.setProperty('--move-folder-hint', `"${t('home.doubleClickToExpand', {}, locale)}"`);
}

export function applyI18n(root = document, locale = getCurrentLocaleSync()) {
  if (!root?.querySelectorAll) return locale;

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n, {}, locale);
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder, {}, locale));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle, {}, locale));
  });

  root.querySelectorAll('[data-i18n-value]').forEach((el) => {
    el.setAttribute('value', t(el.dataset.i18nValue, {}, locale));
  });

  applyDocumentLanguage(locale);
  return locale;
}

export async function initPageI18n(root = document) {
  const locale = await getCurrentLocale();
  applyI18n(root, locale);
  return locale;
}
