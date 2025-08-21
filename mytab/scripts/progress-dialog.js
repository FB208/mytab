/**
 * 进度显示对话框组件
 * 用于显示书签导入过程中的实时进度信息
 */

export class ProgressDialog {
  constructor(container = document.body) {
    this.container = container;
    this.dialog = null;
    this.progressBar = null;
    this.progressText = null;
    this.currentUrlText = null;
    this.statsText = null;
    this.cancelBtn = null;
    this.onCancel = null;
    this.isVisible = false;
  }

  /**
   * 显示进度对话框
   * @param {number} totalItems - 总项目数
   * @param {Function} onCancel - 取消回调函数
   */
  show(totalItems, onCancel = null) {
    if (this.isVisible) {
      return;
    }

    this.onCancel = onCancel;
    this.createDialog(totalItems);
    this.isVisible = true;
  }

  /**
   * 创建对话框DOM结构
   * @param {number} totalItems - 总项目数
   */
  createDialog(totalItems) {
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
    title.textContent = '正在导入书签 - 增强模式';
    title.style.margin = '0 0 20px 0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--text)';

    // 进度条容器
    const progressContainer = document.createElement('div');
    progressContainer.style.marginBottom = '16px';

    // 进度条背景
    const progressBg = document.createElement('div');
    progressBg.style.width = '100%';
    progressBg.style.height = '8px';
    progressBg.style.backgroundColor = 'rgba(15,23,42,0.1)';
    progressBg.style.borderRadius = '4px';
    progressBg.style.overflow = 'hidden';
    progressBg.style.boxShadow = 'inset 2px 2px 4px rgba(163,177,198,0.3), inset -2px -2px 4px rgba(255,255,255,0.7)';

    // 进度条
    this.progressBar = document.createElement('div');
    this.progressBar.style.width = '0%';
    this.progressBar.style.height = '100%';
    this.progressBar.style.background = 'linear-gradient(90deg, var(--primary), rgba(78,168,222,0.8))';
    this.progressBar.style.borderRadius = '4px';
    this.progressBar.style.transition = 'width 0.3s ease';

    progressBg.appendChild(this.progressBar);
    progressContainer.appendChild(progressBg);

    // 进度文本
    this.progressText = document.createElement('div');
    this.progressText.textContent = `0 / ${totalItems} (0%)`;
    this.progressText.style.textAlign = 'center';
    this.progressText.style.fontSize = '14px';
    this.progressText.style.fontWeight = '600';
    this.progressText.style.color = 'var(--text)';
    this.progressText.style.marginTop = '8px';

    // 当前处理URL显示
    const currentUrlLabel = document.createElement('div');
    currentUrlLabel.textContent = '当前处理：';
    currentUrlLabel.style.fontSize = '12px';
    currentUrlLabel.style.color = 'var(--text-dim)';
    currentUrlLabel.style.marginTop = '16px';
    currentUrlLabel.style.marginBottom = '4px';

    this.currentUrlText = document.createElement('div');
    this.currentUrlText.textContent = '正在初始化导入过程...';
    this.currentUrlText.style.fontSize = '13px';
    this.currentUrlText.style.color = 'var(--text)';
    this.currentUrlText.style.wordBreak = 'break-all';
    this.currentUrlText.style.padding = '8px 12px';
    this.currentUrlText.style.backgroundColor = 'rgba(255,255,255,0.5)';
    this.currentUrlText.style.borderRadius = '8px';
    this.currentUrlText.style.border = '1px solid rgba(255,255,255,0.3)';
    this.currentUrlText.style.minHeight = '20px';

    // 统计信息显示
    this.statsText = document.createElement('div');
    this.statsText.textContent = '增强成功: 0 | 增强失败: 0 | 缓存命中: 0';
    this.statsText.style.fontSize = '12px';
    this.statsText.style.color = 'var(--text-dim)';
    this.statsText.style.textAlign = 'center';
    this.statsText.style.marginTop = '12px';
    this.statsText.style.padding = '6px 12px';
    this.statsText.style.backgroundColor = 'rgba(255,255,255,0.3)';
    this.statsText.style.borderRadius = '6px';

    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '12px';
    buttonContainer.style.marginTop = '20px';

    // 取消按钮
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.className = 'ghost-btn';
    this.cancelBtn.textContent = '取消';
    this.cancelBtn.style.minWidth = '80px';
    
    // 取消按钮事件
    this.cancelBtn.addEventListener('click', () => {
      if (this.onCancel) {
        this.onCancel();
      }
      this.hide();
    });

    buttonContainer.appendChild(this.cancelBtn);

    // 组装DOM结构
    inner.appendChild(title);
    inner.appendChild(progressContainer);
    inner.appendChild(this.progressText);
    inner.appendChild(currentUrlLabel);
    inner.appendChild(this.currentUrlText);
    inner.appendChild(this.statsText);
    inner.appendChild(buttonContainer);

    panel.appendChild(inner);
    modal.appendChild(panel);

    // 创建完整的对话框结构
    this.dialog = document.createElement('div');
    this.dialog.appendChild(backdrop);
    this.dialog.appendChild(modal);

    // 添加到容器
    this.container.appendChild(this.dialog);

    // 阻止背景滚动
    document.body.style.overflow = 'hidden';
  }

  /**
   * 更新进度信息
   * @param {number} current - 当前完成数
   * @param {number} total - 总数
   * @param {string} currentUrl - 当前处理的URL
   * @param {Object} timing - 时间信息（可选）
   */
  updateProgress(current, total, currentUrl = '', timing = null) {
    if (!this.isVisible || !this.progressBar) {
      return;
    }

    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    
    // 更新进度条
    this.progressBar.style.width = `${percentage}%`;
    
    // 更新进度文本，包含时间估算
    if (this.progressText) {
      let progressText = `${current} / ${total} (${percentage}%)`;
      
      if (timing && timing.estimatedRemainingText) {
        progressText += ` - 预计剩余: ${timing.estimatedRemainingText}`;
      }
      
      this.progressText.textContent = progressText;
    }
    
    // 更新当前URL
    if (this.currentUrlText && currentUrl) {
      this.currentUrlText.textContent = currentUrl;
    }
  }

  /**
   * 更新统计信息
   * @param {Object} stats - 统计信息对象
   * @param {number} stats.successful - 成功数量
   * @param {number} stats.failed - 失败数量
   * @param {number} [stats.processed] - 已处理数量
   * @param {number} [stats.cached] - 缓存命中数量
   * @param {Object} [stats.errorsByType] - 按类型分类的错误统计
   * @param {Array} [stats.concurrencyAdjustments] - 并发调整历史
   * @param {Object} [timing] - 时间信息
   */
  updateStats(stats, timing = null) {
    if (!this.isVisible || !this.statsText) {
      return;
    }

    const { successful = 0, failed = 0, processed, cached = 0, errorsByType, concurrencyAdjustments } = stats;
    let text = `成功: ${successful} | 失败: ${failed}`;
    
    if (cached > 0) {
      text += ` | 缓存: ${cached}`;
    }
    
    if (typeof processed === 'number') {
      text += ` | 已处理: ${processed}`;
    }

    // 显示当前并发数（如果有调整历史）
    if (concurrencyAdjustments && concurrencyAdjustments.length > 0) {
      const lastAdjustment = concurrencyAdjustments[concurrencyAdjustments.length - 1];
      text += ` | 并发: ${lastAdjustment.to}`;
    }
    
    // 如果有错误分类信息，显示主要错误类型
    if (errorsByType && failed > 0) {
      const mainErrors = [];
      if (errorsByType.timeout > 0) mainErrors.push(`超时:${errorsByType.timeout}`);
      if (errorsByType.network > 0) mainErrors.push(`网络:${errorsByType.network}`);
      if (errorsByType.http4xx > 0) mainErrors.push(`4xx:${errorsByType.http4xx}`);
      if (errorsByType.http5xx > 0) mainErrors.push(`5xx:${errorsByType.http5xx}`);
      if (errorsByType.cors > 0) mainErrors.push(`CORS:${errorsByType.cors}`);
      
      if (mainErrors.length > 0) {
        text += ` (${mainErrors.slice(0, 3).join(', ')})`;
      }
    }
    
    this.statsText.textContent = text;
  }

  /**
   * 设置当前状态文本
   * @param {string} text - 状态文本
   */
  setCurrentStatus(text) {
    if (!this.isVisible || !this.currentUrlText) {
      return;
    }
    
    this.currentUrlText.textContent = text;
  }

  /**
   * 设置完成状态
   * @param {Object} finalStats - 最终统计信息
   */
  setCompleted(finalStats) {
    if (!this.isVisible) {
      return;
    }

    // 更新按钮文本
    if (this.cancelBtn) {
      this.cancelBtn.textContent = '关闭';
    }

    // 更新状态文本
    const duration = finalStats.startTime ? Math.round((Date.now() - finalStats.startTime) / 1000) : 0;
    this.setCurrentStatus(`导入完成！用时 ${duration} 秒`);

    // 更新最终统计
    this.updateStats(finalStats);

    // 进度条设为100%
    if (this.progressBar) {
      this.progressBar.style.width = '100%';
    }

    // 如果有错误，显示错误摘要
    if (finalStats.failed > 0 && finalStats.errorsByType) {
      this._showErrorSummary(finalStats);
    }
  }

  /**
   * 显示错误摘要
   * @param {Object} stats - 统计信息
   * @private
   */
  _showErrorSummary(stats) {
    if (!this.isVisible || !stats.errorsByType) {
      return;
    }

    // 创建错误摘要容器
    const errorSummary = document.createElement('div');
    errorSummary.style.marginTop = '12px';
    errorSummary.style.padding = '8px 12px';
    errorSummary.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
    errorSummary.style.borderRadius = '6px';
    errorSummary.style.border = '1px solid rgba(239, 68, 68, 0.2)';

    const errorTitle = document.createElement('div');
    errorTitle.textContent = '增强失败统计：';
    errorTitle.style.fontSize = '12px';
    errorTitle.style.fontWeight = '600';
    errorTitle.style.color = '#dc2626';
    errorTitle.style.marginBottom = '4px';

    const errorDetails = document.createElement('div');
    errorDetails.style.fontSize = '11px';
    errorDetails.style.color = '#7f1d1d';
    errorDetails.style.lineHeight = '1.4';

    const errorTypes = [];
    const { errorsByType } = stats;
    
    if (errorsByType.timeout > 0) errorTypes.push(`请求超时: ${errorsByType.timeout}个`);
    if (errorsByType.network > 0) errorTypes.push(`网络错误: ${errorsByType.network}个`);
    if (errorsByType.http4xx > 0) errorTypes.push(`客户端错误(4xx): ${errorsByType.http4xx}个`);
    if (errorsByType.http5xx > 0) errorTypes.push(`服务器错误(5xx): ${errorsByType.http5xx}个`);
    if (errorsByType.cors > 0) errorTypes.push(`跨域限制: ${errorsByType.cors}个`);
    if (errorsByType.ssl > 0) errorTypes.push(`SSL错误: ${errorsByType.ssl}个`);
    if (errorsByType.parse > 0) errorTypes.push(`解析错误: ${errorsByType.parse}个`);
    if (errorsByType.other > 0) errorTypes.push(`其他错误: ${errorsByType.other}个`);

    errorDetails.textContent = errorTypes.join('，');

    errorSummary.appendChild(errorTitle);
    errorSummary.appendChild(errorDetails);

    // 插入到统计信息后面
    if (this.statsText && this.statsText.parentNode) {
      this.statsText.parentNode.insertBefore(errorSummary, this.statsText.nextSibling);
    }
  }

  /**
   * 设置错误状态
   * @param {string} errorMessage - 错误信息
   */
  setError(errorMessage) {
    if (!this.isVisible) {
      return;
    }

    // 更新按钮文本
    if (this.cancelBtn) {
      this.cancelBtn.textContent = '关闭';
    }

    // 更新状态文本
    this.setCurrentStatus(`错误: ${errorMessage}`);

    // 将当前URL文本设为红色
    if (this.currentUrlText) {
      this.currentUrlText.style.color = '#ef4444';
    }
  }

  /**
   * 隐藏对话框
   */
  hide() {
    if (!this.isVisible || !this.dialog) {
      return;
    }

    // 恢复背景滚动
    document.body.style.overflow = '';

    // 移除DOM元素
    this.dialog.remove();
    this.dialog = null;
    this.progressBar = null;
    this.progressText = null;
    this.currentUrlText = null;
    this.statsText = null;
    this.cancelBtn = null;
    this.onCancel = null;
    this.isVisible = false;
  }

  /**
   * 检查对话框是否可见
   * @returns {boolean} 是否可见
   */
  get visible() {
    return this.isVisible;
  }
}