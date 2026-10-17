// 2026-09-14：分集模式控制独立于全能创作；每集保留自己的 iframe，切换模式不重载内容。
(() => {
  'use strict';
  const workspace = document.querySelector('[data-view="episode-detail"]');
  const storyboard = document.getElementById('episodeVideoStoryboardPanel');
  const canvas = document.getElementById('episodeVideoCanvasPanel');
  const title = document.getElementById('episodeDetailTopTitle');
  const editButton = document.getElementById('detailEditButton');
  const detailVideo = document.getElementById('detailVideo');
  const panelResizer = document.getElementById('detailPanelResizer');
  // 2026-09-26 Product Design 改动逻辑：左栏分隔线独立于右侧预览分隔线，两侧拖动各自只改变对应列宽。
  const sidebarResizer = document.getElementById('detailSidebarResizer');
  if (!workspace || !storyboard || !canvas || !title) return;
  // 2026-09-26 改动逻辑：第一行承载短剧剪辑器的标题、导出菜单与关闭按钮，仍保留原返回按钮和隐藏的当前分集标题节点供状态同步。
  const composerTitle = document.getElementById('episodeComposerTitle');
  const composerActions = document.getElementById('episodeComposerActions');
  const composerExportToggle = composerActions?.querySelector('[data-episode-composer-export-toggle]');
  const composerExportMenu = document.getElementById('episodeComposerExportMenu');
  const tabs = Array.from(workspace.querySelectorAll('[data-episode-video-mode]'));
  const canvasAgentButton = workspace.querySelector('[data-episode-side-panel="agent"]');
  const sidePanelButtons = Array.from(workspace.querySelectorAll('[data-episode-side-panel]'));
  const frames = new Map();
  let activeComposerFrame = null;
  let episode = title.textContent.trim();
  // 2026-09-17 改动逻辑：记录剪辑器是否由第 3 步卡片按钮直接打开，以便关闭后返回分集视频列表而不是本集提示词页。
  let openedFromEditStep = false;
  // 2026-09-16 修复逻辑：为每次进入剪辑分配递增请求号；重复点击或返回时让旧轮询自动失效，避免迟到的首次请求再次切换页面。
  let editorOpenRequestId = 0;
  // 2026-09-26 改动逻辑：顶栏按钮代理当前短剧 iframe 内的原剪辑按钮，原导出格式、关闭和保存逻辑继续由剪辑器处理。
  function clickActiveComposerControl(selector) {
    if (!activeComposerFrame || activeComposerFrame.hidden) return false;
    let editor;
    try { editor = activeComposerFrame.contentDocument?.querySelector('.libtv-editor.is-full.is-episode-composer:not([hidden])'); } catch (error) { return false; }
    const control = editor?.querySelector(selector);
    if (!control || control.disabled) return false;
    control.click();
    return true;
  }
  function setComposerExportMenuOpen(open) {
    if (!composerExportMenu || !composerExportToggle) return;
    composerExportMenu.hidden = !open;
    composerExportToggle.setAttribute('aria-expanded', String(Boolean(open)));
  }
  function setComposerToolbarVisible(open, frame = null) {
    const visible = Boolean(open && frame);
    activeComposerFrame = visible ? frame : null;
    workspace.classList.toggle('is-episode-composer-open', visible);
    // 2026-10-10 Product Design 改动逻辑：短剧剪辑左上角复用当前分集详情标题，以“第几集 · 集名”展示；每次打开读取当前集，避免固定显示“视频合成”或沿用上一集标题。
    if (composerTitle) {
      composerTitle.textContent = (title.textContent.trim() || episode).replace(/\s*[：:]\s*/, ' · ');
      composerTitle.hidden = !visible;
    }
    if (composerActions) composerActions.hidden = !visible;
    setComposerExportMenuOpen(false);
    // 2026-09-26 改动逻辑：剪辑顶栏出现时收起旧切集弹层，退出后不会意外恢复一个已展开的分集菜单。
    if (visible) {
      const switcherMenu = document.getElementById('episodeSwitcherMenu');
      if (switcherMenu) switcherMenu.hidden = true;
      document.getElementById('episodeSwitcherToggle')?.setAttribute('aria-expanded', 'false');
    }
  }
  composerExportToggle?.addEventListener('click', event => {
    event.stopPropagation();
    // 2026-09-26 改动逻辑：父页只显示菜单，格式选择时才调用 iframe 内原按钮，避免两层隐藏菜单状态互相干扰。
    if (!activeComposerFrame || activeComposerFrame.hidden) return;
    const trigger = activeComposerFrame.contentDocument?.querySelector('.libtv-editor.is-full.is-episode-composer:not([hidden]) [data-libtv-export-toggle]');
    if (!trigger || trigger.disabled) return;
    setComposerExportMenuOpen(composerExportMenu.hidden);
  });
  composerExportMenu?.addEventListener('click', event => {
    const option = event.target.closest('[data-episode-composer-format]');
    if (!option) return;
    const format = option.dataset.episodeComposerFormat;
    if (format !== 'mp4' && format !== 'jianying') return;
    setComposerExportMenuOpen(false);
    clickActiveComposerControl(format === 'mp4' ? '[data-libtv-export-local]' : '[data-libtv-export-canvas]');
  });
  // 2026-09-30 Product Design 改动逻辑：导入入口只存在于短剧顶栏；确认后模拟转圈及当前剪辑视图刷新，保留素材和草稿，不执行真实替换。
  const importButton = document.getElementById('episodeComposerImport');
  const importModal = document.getElementById('episodeComposerImportModal');
  const importCancel = document.getElementById('episodeComposerImportCancel');
  const importConfirm = document.getElementById('episodeComposerImportConfirm');
  let importFrame = null;
  function closeImportModal() {
    if (importModal) importModal.hidden = true;
    importButton?.focus();
  }
  importButton?.addEventListener('click', () => {
    if (!activeComposerFrame || importButton.disabled) return;
    importFrame = activeComposerFrame;
    setComposerExportMenuOpen(false);
    importModal.hidden = false;
    importCancel?.focus();
  });
  importCancel?.addEventListener('click', closeImportModal);
  importModal?.addEventListener('click', event => { if (event.target === importModal) closeImportModal(); });
  importModal?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeImportModal(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === importCancel ? importConfirm : importCancel)?.focus();
    }
  });
  importConfirm?.addEventListener('click', () => {
    const frame = importFrame;
    closeImportModal();
    if (!frame || frame !== activeComposerFrame || frame.hidden) return;
    importButton.disabled = true;
    importButton.setAttribute('aria-busy', 'true');
    importButton.innerHTML = '<img class="episode-composer-import-spinner" src="./assets/icons/script-loader.svg" alt="">导入中…';
    window.setTimeout(() => {
      importButton.disabled = false;
      importButton.removeAttribute('aria-busy');
      importButton.textContent = '导入该集视频';
      // 模拟刷新仅作用于发起操作的当前短剧剪辑视图，不重载整页、不影响其他集及全能创作。
      if (activeComposerFrame !== frame || frame.hidden || workspace.hidden) return;
      openCurrentVideoEditor(true);
      frame.classList.remove('episode-composer-import-refresh');
      void frame.offsetWidth;
      frame.classList.add('episode-composer-import-refresh');
    }, 1200);
  });
  // 2026-09-30 改动逻辑：剪辑审核代理视频生成页同一个按钮，防止两处产生独立提交状态。
  document.getElementById('episodeComposerReview')?.addEventListener('click', () => {
    if (!activeComposerFrame || activeComposerFrame.hidden) return;
    document.getElementById('detailReviewComplete')?.click();
  });
  // 2026-09-26 改动逻辑：右侧关闭入口已移除；退出短剧剪辑继续由左上角返回按钮调用原有关闭流程。
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.episode-composer-export-wrap')) setComposerExportMenuOpen(false);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || composerExportMenu?.hidden !== false) return;
    event.preventDefault();
    setComposerExportMenuOpen(false);
    composerExportToggle?.focus();
  });
  // 2026-09-17 Product Design 改动逻辑：拖动提示词右边框时实时改写视频列宽；为提示词保留可编辑下限，并支持方向键微调与双击恢复默认。
  function getPreviewWidthLimits() {
    const panelWidth = storyboard.getBoundingClientRect().width;
    const sidebar = storyboard.querySelector('.episode-agent-sidebar');
    const sidebarWidth = window.matchMedia('(min-width: 1000px)').matches && sidebar && !sidebar.hidden ? sidebar.getBoundingClientRect().width : 0;
    const gap = Number.parseFloat(getComputedStyle(storyboard).columnGap) || 10;
    const gapCount = sidebarWidth ? 2 : 1;
    const min = 230;
    const minPromptWidth = sidebarWidth ? 420 : 520;
    const availableMax = panelWidth - sidebarWidth - gap * gapCount - minPromptWidth;
    const max = Math.max(min, Math.min(panelWidth * .58, availableMax));
    return { min, max };
  }
  function setPreviewWidth(nextWidth) {
    const limits = getPreviewWidthLimits();
    const width = Math.round(Math.min(limits.max, Math.max(limits.min, nextWidth)));
    storyboard.style.setProperty('--episode-preview-width', `${width}px`);
    panelResizer?.setAttribute('aria-valuemin', String(Math.round(limits.min)));
    panelResizer?.setAttribute('aria-valuemax', String(Math.round(limits.max)));
    panelResizer?.setAttribute('aria-valuenow', String(width));
  }
  function resetPreviewWidth() {
    storyboard.style.removeProperty('--episode-preview-width');
    const width = storyboard.querySelector('.detail-player-panel')?.getBoundingClientRect().width || 320;
    panelResizer?.setAttribute('aria-valuenow', String(Math.round(width)));
  }
  if (panelResizer) {
    panelResizer.addEventListener('pointerdown', event => {
      if (!window.matchMedia('(min-width: 1000px)').matches) return;
      event.preventDefault();
      panelResizer.setPointerCapture(event.pointerId);
      panelResizer.classList.add('is-dragging');
      document.body.classList.add('is-episode-panel-resizing');
      setPreviewWidth(storyboard.getBoundingClientRect().right - event.clientX);
    });
    panelResizer.addEventListener('pointermove', event => {
      if (!panelResizer.classList.contains('is-dragging')) return;
      setPreviewWidth(storyboard.getBoundingClientRect().right - event.clientX);
    });
    const finishPanelResize = event => {
      if (!panelResizer.classList.contains('is-dragging')) return;
      if (panelResizer.hasPointerCapture(event.pointerId)) panelResizer.releasePointerCapture(event.pointerId);
      panelResizer.classList.remove('is-dragging');
      document.body.classList.remove('is-episode-panel-resizing');
    };
    panelResizer.addEventListener('pointerup', finishPanelResize);
    panelResizer.addEventListener('pointercancel', finishPanelResize);
    panelResizer.addEventListener('dblclick', resetPreviewWidth);
    panelResizer.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = storyboard.querySelector('.detail-player-panel')?.getBoundingClientRect().width || 320;
      setPreviewWidth(current + (event.key === 'ArrowLeft' ? 16 : -16));
    });
    window.addEventListener('resize', () => {
      const inlineWidth = Number.parseFloat(storyboard.style.getPropertyValue('--episode-preview-width'));
      if (Number.isFinite(inlineWidth)) setPreviewWidth(inlineWidth);
    });
    resetPreviewWidth();
  }
  // 2026-09-26 Product Design 改动逻辑：左栏默认保持原 clamp 宽度；仅在桌面展开时接受拖动，保留中央编辑区 420px，方向键微调并允许双击清除自定义宽度。
  function getDefaultSidebarWidth() {
    return Math.min(280, Math.max(240, window.innerWidth * .146));
  }
  function getSidebarWidthLimits() {
    // 2026-09-26 Product Design 修复逻辑：列宽上限使用网格内容宽度，扣除容器内边距，确保中央编辑区实际保有 420px。
    const panelStyle = getComputedStyle(storyboard);
    const panelWidth = storyboard.getBoundingClientRect().width - (Number.parseFloat(panelStyle.paddingLeft) || 0) - (Number.parseFloat(panelStyle.paddingRight) || 0);
    const previewWidth = storyboard.querySelector('.detail-player-panel')?.getBoundingClientRect().width || 230;
    const gap = Number.parseFloat(panelStyle.columnGap) || 10;
    const min = 200;
    const max = Math.max(min, Math.min(panelWidth * .48, panelWidth - previewWidth - gap * 2 - 420));
    return { min, max };
  }
  function setSidebarWidth(nextWidth) {
    const limits = getSidebarWidthLimits();
    const width = Math.round(Math.min(limits.max, Math.max(limits.min, nextWidth)));
    storyboard.style.setProperty('--episode-sidebar-width', `${width}px`);
    sidebarResizer?.setAttribute('aria-valuemin', String(limits.min));
    sidebarResizer?.setAttribute('aria-valuemax', String(Math.round(limits.max)));
    sidebarResizer?.setAttribute('aria-valuenow', String(width));
  }
  function resetSidebarWidth() {
    storyboard.style.removeProperty('--episode-sidebar-width');
    sidebarResizer?.setAttribute('aria-valuenow', String(Math.round(getDefaultSidebarWidth())));
    sidebarResizer?.setAttribute('aria-valuemax', String(Math.round(getSidebarWidthLimits().max)));
  }
  if (sidebarResizer) {
    sidebarResizer.addEventListener('pointerdown', event => {
      const sidebar = storyboard.querySelector('.episode-agent-sidebar');
      if (!window.matchMedia('(min-width: 1000px)').matches || !sidebar || sidebar.hidden) return;
      event.preventDefault();
      sidebarResizer.setPointerCapture(event.pointerId);
      sidebarResizer.classList.add('is-dragging');
      document.body.classList.add('is-episode-panel-resizing');
      // 2026-09-26 Product Design 修复逻辑：以左栏真实起点计算拖动距离，首次按下不会因外层 padding 造成宽度跳动。
      setSidebarWidth(event.clientX - sidebar.getBoundingClientRect().left);
    });
    sidebarResizer.addEventListener('pointermove', event => {
      if (!sidebarResizer.classList.contains('is-dragging')) return;
      setSidebarWidth(event.clientX - storyboard.querySelector('.episode-agent-sidebar').getBoundingClientRect().left);
    });
    const finishSidebarResize = event => {
      if (!sidebarResizer.classList.contains('is-dragging')) return;
      if (sidebarResizer.hasPointerCapture(event.pointerId)) sidebarResizer.releasePointerCapture(event.pointerId);
      sidebarResizer.classList.remove('is-dragging');
      document.body.classList.remove('is-episode-panel-resizing');
    };
    sidebarResizer.addEventListener('pointerup', finishSidebarResize);
    sidebarResizer.addEventListener('pointercancel', finishSidebarResize);
    sidebarResizer.addEventListener('dblclick', resetSidebarWidth);
    sidebarResizer.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = storyboard.querySelector('.episode-agent-sidebar')?.getBoundingClientRect().width || getDefaultSidebarWidth();
      setSidebarWidth(current + (event.key === 'ArrowRight' ? 16 : -16));
    });
    window.addEventListener('resize', () => {
      const inlineWidth = Number.parseFloat(storyboard.style.getPropertyValue('--episode-sidebar-width'));
      if (Number.isFinite(inlineWidth)) setSidebarWidth(inlineWidth);
      else resetSidebarWidth();
    });
    resetSidebarWidth();
  }
  function getFirstCanvasProjectName() {
    return document.querySelector('[data-project-panel="canvas"] .project-card[data-project-destination="canvas-workbench"] .project-title')?.textContent.trim() || '未命名项目';
  }
  // 2026-09-17 改动逻辑：短剧内嵌画布使用专属上下文隐藏项目横条并把腾出的高度补给 Agent；通过 iframe 标记隔离，全能创作不受影响。
  function configureEpisodeCanvas(frame) {
    let frameDocument;
    try { frameDocument = frame.contentDocument; } catch (error) { return; }
    if (!frameDocument?.documentElement) return;
    frameDocument.documentElement.classList.add('vina-episode-canvas-context');
    installStoryboardTimeline(frame);
    if (!frameDocument.getElementById('vina-episode-canvas-context-style')) {
      const style = frameDocument.createElement('style');
      style.id = 'vina-episode-canvas-context-style';
      style.textContent = `
        /* 2026-09-17 改动逻辑：短剧画布移除项目标题横条，Agent 标题上移并沿用原底部边距，从而增加消息与输入区域的可用高度。 */
        html.vina-episode-canvas-context .chat > .chat-head { display: none !important; }
        html.vina-episode-canvas-context .chat:not(.is-conversation-collapsed)::before { top: 24px !important; }
      `;
      frameDocument.head.append(style);
    }
    const chat = frameDocument.getElementById('chatPanel');
    if (!chat) return;
    // 2026-09-17 改动逻辑：画布内关闭按钮仍负责收起 Agent，同时把收起状态同步到外层顶栏，顶栏 Agent 成为唯一恢复入口。
    const syncAgentButton = () => {
      if (workspace.dataset.episodeVideoMode !== 'canvas') return;
      const expanded = !chat.classList.contains('is-conversation-collapsed');
      canvasAgentButton?.setAttribute('aria-expanded', String(expanded));
      canvasAgentButton?.classList.toggle('is-active', expanded);
    };
    syncAgentButton();
    if (chat.dataset.episodeCanvasCollapseSync !== 'true') {
      chat.dataset.episodeCanvasCollapseSync = 'true';
      new frame.contentWindow.MutationObserver(syncAgentButton).observe(chat, { attributes:true, attributeFilter:['class'] });
    }
  }
  // 2026-09-17 改动逻辑：时间轴只注入分集 iframe；所有草稿、拖拽浮图和命中区域留在该 iframe，完全隔离全能创作。
  function installStoryboardTimeline(frame) {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc?.body || doc.getElementById('episode-storyboard-timeline-style')) return;
    const style = doc.createElement('style');
    style.id = 'episode-storyboard-timeline-style';
    style.textContent = `
      #episodeStoryboardTimeline { position:fixed; left:30%; right:28px; bottom:68px; z-index:100000; padding:16px 18px 18px; border:1px solid #ffffff21; border-radius:28px; background:#202020; color:#bbb; box-shadow:0 12px 44px #0008; font:14px/1.4 system-ui,sans-serif; }
      #episodeStoryboardTimeline[hidden] { display:none !important; }
      #episodeStoryboardTimeline .episode-timeline-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:10px; }
      #episodeStoryboardTimeline .episode-timeline-hint { display:flex; align-items:center; gap:6px; }
      #episodeStoryboardTimeline .episode-timeline-actions { display:flex; gap:8px; flex-shrink:0; }
      #episodeStoryboardTimeline button { border:0; border-radius:20px; padding:7px 13px; background:#393939; color:white; font:600 14px/1.4 system-ui,sans-serif; cursor:pointer; }
      #episodeStoryboardTimeline button[data-apply] { background:#fff; color:#111; }
      #episodeStoryboardTimeline button:focus-visible { outline:2px solid #398bff; outline-offset:3px; }
      #episodeStoryboardTimeline .episode-timeline-track { display:flex; align-items:center; gap:4px; overflow-x:auto; min-height:104px; padding:2px; scrollbar-width:thin; scrollbar-color:#555 transparent; }
      #episodeStoryboardTimeline .episode-timeline-clip, #episodeStoryboardTimeline .episode-timeline-slot { position:relative; flex:0 0 184px; height:104px; box-sizing:border-box; border-radius:4px; border:1px solid #ffffff24; overflow:hidden; background-size:cover; background-position:center; transition:transform .12s; }
      #episodeStoryboardTimeline .episode-timeline-clip video { width:100%; height:100%; object-fit:cover; pointer-events:none; }
      #episodeStoryboardTimeline .episode-timeline-clip span { position:absolute; inset:auto 0 0; padding:16px 8px 6px; color:#ddd; font-size:12px; background:linear-gradient(transparent,#0009); }
      #episodeStoryboardTimeline .episode-timeline-clip.is-replace { border:2px solid #398bff; box-shadow:inset 0 0 0 100px #398bff38; }
      #episodeStoryboardTimeline .episode-timeline-clip.is-replace::after { content:''; position:absolute; inset:0; background:#398bff33; pointer-events:none; }
      #episodeStoryboardTimeline .episode-timeline-slot { display:flex; align-items:center; justify-content:center; border:1px dashed #398bff; background:#398bff30; color:#62a5ff; font-size:28px; }
      .episode-storyboard-drag-ghost { position:fixed; width:174px; height:98px; z-index:2147483600; pointer-events:none; border:1px solid #ffffff50; border-radius:4px; overflow:hidden; background:#252525 center/cover; box-shadow:0 12px 32px #0009; }
      .episode-storyboard-drag-ghost video { width:100%; height:100%; object-fit:cover; }
      html.vina-episode-canvas-context #nodeActionBar [data-episode-add-storyboard][hidden] { display:none !important; }
      @media(max-width:800px) { #episodeStoryboardTimeline { left:16px !important; right:16px; bottom:64px; padding:12px; } #episodeStoryboardTimeline .episode-timeline-hint { font-size:12px; } }
    `;
    doc.head.append(style);
    const panel = doc.createElement('section');
    panel.id = 'episodeStoryboardTimeline';
    panel.hidden = true;
    panel.setAttribute('aria-label', '添加到故事板');
    panel.innerHTML = '<div class="episode-timeline-head"><span class="episode-timeline-hint"><svg width="15" height="18" viewBox="0 0 18 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1" y="2" width="3" height="16" rx="1"/><rect x="7" y="2" width="3" height="16" rx="1"/><path d="M12 10h6m-3-3 3 3-3 3"/></svg>将素材移动到分镜轴上即可替换/添加新分镜</span><div class="episode-timeline-actions"><button type="button" data-cancel>取消</button><button type="button" data-apply>应用</button></div></div><div class="episode-timeline-track" aria-label="故事板分镜轴"></div>';
    doc.body.append(panel);
    const track = panel.querySelector('.episode-timeline-track');
    let draft = [], draftKey = '', drag = null, hit = null, suppressClick = false;
    const ghost = doc.createElement('div');
    ghost.className = 'episode-storyboard-drag-ghost';
    const placeholder = doc.createElement('div');
    placeholder.className = 'episode-timeline-slot';
    placeholder.textContent = '+';
    let button;
    let contextButton;
    const selected = () => doc.querySelector('.node.selected');
    const playable = node => {
      if (!node || node.dataset.generationStatus === 'generating' || node.dataset.remakeGenerationStatus === 'generating' || node.querySelector('.thumb.blank, .thumb.generating')) return null;
      const video = node.querySelector('video.node-video, .thumb video');
      return video && (video.currentSrc || video.getAttribute('src')) ? video : null;
    };
    // 2026-09-17 改动逻辑：优先用素材封面，无封面时从当前视频帧提取图片；跨域无法取帧则用静音首帧预览兜底。
    function mediaFromNode(node, video) {
      let poster = video.poster || '';
      if (!poster && video.readyState >= 2 && video.videoWidth) {
        try {
          const image = doc.createElement('canvas');
          image.width = 480;
          image.height = Math.round(480 * video.videoHeight / video.videoWidth);
          image.getContext('2d').drawImage(video, 0, 0, image.width, image.height);
          poster = image.toDataURL('image/jpeg', .85);
        } catch (_) { /* 远程媒体受浏览器跨域保护时使用视频首帧。 */ }
      }
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Number(node.dataset.videoDuration) || 9;
      // 2026-09-17 修复逻辑：节点输入框位于共享浮层，不在节点内部；选中节点读取当前编辑值，其他节点读取各自保存的提示词字段。
      const editor = doc.getElementById('nodePrompt');
      const prompt = node === selected() && editor ? editor.value : (node.dataset.nodePromptDraft ?? node.dataset.generationPrompt ?? node.dataset.assetPrompt ?? node.dataset.remakePrompt ?? node.dataset.prompt ?? node.querySelector('textarea')?.value ?? '');
      // 保存拖拽时画面位置，无法跨域导出图片时，故事板用同源地址的视频静帧还原相同封面。
      return { videoSrc: video.currentSrc || video.src, videoPoster: poster, videoCoverTime: String(video.currentTime || 0), cover: poster ? `url(${JSON.stringify(poster)})` : '', duration: `${Math.round(duration * 10) / 10}s`, generationState: 'generated', prompt, sourceNodeId: node.id };
    }
    function fillPreview(element, clip) {
      element.style.backgroundImage = clip.cover || 'none';
      if (!clip.cover && clip.videoSrc) {
        const video = doc.createElement('video');
        video.src = clip.videoSrc;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(Number(clip.videoCoverTime) || .001, Math.max(0, video.duration - .001)); }, { once:true });
        element.append(video);
      }
    }
    function render() {
      track.replaceChildren();
      draft.forEach((clip, index) => {
        const card = doc.createElement('div');
        card.className = 'episode-timeline-clip';
        card.dataset.index = String(index);
        fillPreview(card, clip);
        const label = doc.createElement('span');
        label.textContent = `分镜${index + 1}`;
        card.append(label);
        track.append(card);
      });
    }
    function clearHit() {
      hit = null;
      placeholder.remove();
      track.querySelectorAll('.is-replace').forEach(card => card.classList.remove('is-replace'));
    }
    function finishDrag() {
      drag = null;
      ghost.remove();
      clearHit();
    }
    function close() { finishDrag(); panel.hidden = true; button?.setAttribute('aria-expanded', 'false'); }
    panel.querySelector('[data-cancel]').addEventListener('click', close);
    panel.querySelector('[data-apply]').addEventListener('click', () => {
      if (window.vinaApplyEpisodeStoryboard?.(draftKey, draft)) {
        close();
        setMode('storyboard', true);
      }
    });
    function open() {
      const snapshot = window.vinaReadEpisodeStoryboard?.();
      if (!snapshot) return;
      if (panel.hidden) { draftKey = snapshot.key; draft = snapshot.clips.map(clip => ({ ...clip })); render(); }
      const chat = doc.getElementById('chatPanel');
      const rect = chat?.getBoundingClientRect();
      panel.style.left = rect && !chat.classList.contains('is-conversation-collapsed') ? `${Math.min(rect.right + 24, win.innerWidth * .48)}px` : 'max(24px, 12%)';
      panel.hidden = false;
      button?.setAttribute('aria-expanded', 'true');
    }
    function syncButton() {
      const remake = doc.querySelector('#nodeActionBar [data-clip-remake]');
      if (!remake) return;
      if (!button?.isConnected) {
        button = doc.createElement('button');
        button.type = 'button';
        button.className = 'clip-remake-toolbar-btn';
        button.dataset.episodeAddStoryboard = 'true';
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M3 9h5M3 15h5m5-6v6m-3-3h6"/></svg><span>添加到故事板</span>';
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', event => { event.stopPropagation(); open(); });
        remake.before(button);
      }
      const canAddToStoryboard = Boolean(playable(selected()));
      button.hidden = !canAddToStoryboard;

      // 2026-09-17 改动逻辑：短剧分集画布的视频节点右键菜单复用上方“添加到故事板”入口；仅有效视频显示，点击后打开同一条故事板时间轴。
      const contextMenu = doc.getElementById('contextMenu');
      if (contextMenu && !contextButton?.isConnected) {
        contextButton = doc.createElement('button');
        contextButton.type = 'button';
        contextButton.dataset.episodeAddStoryboardContext = 'true';
        contextButton.innerHTML = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M3 9h5M3 15h5m5-6v6m-3-3h6"/></svg>添加到故事板';
        contextButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          contextMenu.style.display = 'none';
          open();
        });
        contextMenu.prepend(contextButton);
      }
      if (contextButton) contextButton.hidden = !canAddToStoryboard;
    }
    let syncQueued = false;
    new win.MutationObserver(() => {
      if (syncQueued) return;
      syncQueued = true;
      win.requestAnimationFrame(() => { syncQueued = false; syncButton(); });
    }).observe(doc.body, { subtree:true, childList:true, attributes:true, attributeFilter:['class'] });
    syncButton();
    // 2026-09-17 改动逻辑：时间轴打开时拖动视频主体只复制素材；拦截原节点移动，浮动缩略图跟随指针，原视频仍留在画布。
    doc.addEventListener('pointerdown', event => {
      if (panel.hidden || event.button !== 0 || event.target.closest('button,input,textarea,.connect-handle,[data-video-controls],.node-video-controls,.clip-remake-player-controls')) return;
      const node = event.target.closest('.node');
      const video = playable(node);
      if (!video || !event.target.closest('.thumb')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = { node, video, x:event.clientX, y:event.clientY, id:event.pointerId, active:false };
    }, true);
    doc.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      if (!drag.active) {
        drag.active = true;
        drag.clip = mediaFromNode(drag.node, drag.video);
        ghost.replaceChildren();
        fillPreview(ghost, drag.clip);
        doc.body.append(ghost);
      }
      ghost.style.left = `${event.clientX - 87}px`;
      ghost.style.top = `${event.clientY - 76}px`;
      const bounds = track.getBoundingClientRect();
      if (event.clientY < bounds.top - 15 || event.clientY > bounds.bottom + 15 || event.clientX < bounds.left || event.clientX > bounds.right) { clearHit(); return; }
      if (event.clientX > bounds.right - 36) track.scrollLeft += 14;
      if (event.clientX < bounds.left + 36) track.scrollLeft -= 14;
      // 保留插入占位区域的命中，避免两侧缩略图腾挪后在替换和插入之间抖动。
      if (placeholder.isConnected) {
        const slot = placeholder.getBoundingClientRect();
        if (event.clientX >= slot.left - 4 && event.clientX <= slot.right + 4) return;
      }
      clearHit();
      const cards = [...track.querySelectorAll('.episode-timeline-clip')];
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const index = Number(card.dataset.index);
        if (event.clientX <= rect.right) {
          if (event.clientX < rect.left + 26) hit = { type:'insert', index };
          else if (event.clientX > rect.right - 26) hit = { type:'insert', index:index + 1 };
          else { hit = { type:'replace', index }; card.classList.add('is-replace'); }
          break;
        }
      }
      if (!hit) hit = { type:'insert', index:draft.length };
      if (hit.type === 'insert') track.insertBefore(placeholder, cards[hit.index] || null);
    }, true);
    doc.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (drag.active && hit) {
        const clip = { ...drag.clip };
        if (hit.type === 'replace') draft[hit.index] = { ...draft[hit.index], ...clip };
        else draft.splice(hit.index, 0, clip);
        render();
      }
      suppressClick = drag.active;
      finishDrag();
      win.setTimeout(() => { suppressClick = false; }, 0);
    }, true);
    doc.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    doc.addEventListener('pointercancel', finishDrag, true);
    win.addEventListener('blur', finishDrag);
    doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.stopImmediatePropagation(); close(); } }, true);
    // 切换模式或分集时丢弃未应用草稿，重新打开始终从当前故事板读取。
    frame.vinaCloseStoryboardTimeline = close;
  }
  function syncStoryboardSidePanelButtons() {
    const sidebar = workspace.querySelector('.episode-agent-sidebar');
    sidePanelButtons.forEach(button => {
      const pane = document.getElementById(button.getAttribute('aria-controls'));
      const expanded = Boolean(sidebar && !sidebar.hidden && pane && !pane.hidden);
      button.setAttribute('aria-expanded', String(expanded));
      button.classList.toggle('is-active', expanded);
    });
  }
  function ensureCanvas() {
    let frame = frames.get(episode);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = episode + ' · 独立画布';
      frame.name = 'episode-video:' + episode;
      frame.allow = 'autoplay; fullscreen; clipboard-write';
      // 2026-09-26 改动逻辑：刷新短剧专属 iframe 缓存，使分集剪辑菜单加载 MP4 与剪映工程选项；全能创作画布继续使用自己的代码入口。
      // 2026-09-26 改动逻辑：刷新短剧内嵌剪辑器缓存，仅分集工程隐藏第二行并将内容上移。
      // 2026-10-11 改动逻辑：更新静态画布缓存版本，使独立分集剪辑器也加载 Figma Toast 及显式失败状态。
      frame.src = './assets/episode-canvas/index.html?v=20261011-figma-toast';
      // 2026-09-14 改动逻辑：短剧切到画布模式时打开画布列表的第一个现有项目，保留其预置节点，并同步项目标题，不再按“从首页新建”流程清空为无内容项目。
      frame.addEventListener('load', () => {
        frame.contentWindow.postMessage({ type:'vina-canvas-new-project', projectName:getFirstCanvasProjectName() }, '*');
        configureEpisodeCanvas(frame);
      }, { once:true });
      frames.set(episode, frame);
      canvas.append(frame);
    }
    // 2026-09-26 改动逻辑：切换到另一集的 iframe 前撤下旧剪辑器代理按钮，等待新工程真实打开后再显示第一行操作。
    if (activeComposerFrame && activeComposerFrame !== frame) setComposerToolbarVisible(false);
    frames.forEach(item => { item.hidden = item !== frame; });
    return frame;
  }
  function setMode(mode, focus = false) {
    const isCanvas = mode === 'canvas';
    // 2026-09-26 改动逻辑：退出短剧画布时同步撤下代理顶栏，普通分集详情恢复原切集与侧栏入口。
    if (!isCanvas) setComposerToolbarVisible(false);
    // 2026-09-17 改动逻辑：退出画布即取消未提交时间轴草稿。
    if (!isCanvas) frames.forEach(frame => frame.vinaCloseStoryboardTimeline?.());
    storyboard.hidden = isCanvas;
    canvas.hidden = !isCanvas;
    workspace.dataset.episodeVideoMode = mode;
    tabs.forEach(tab => {
      const active = tab.dataset.episodeVideoMode === mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    if (isCanvas) {
      const frame = ensureCanvas();
      configureEpisodeCanvas(frame);
    } else {
      syncStoryboardSidePanelButtons();
    }
  }
  // 2026-09-17 改动逻辑：画布模式的顶栏 Agent 不再打开故事板侧栏，只展开 iframe 内 Agent；剧本模式下保留既有按钮行为。
  canvasAgentButton?.addEventListener('click', event => {
    if (workspace.dataset.episodeVideoMode !== 'canvas') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const frame = ensureCanvas();
    configureEpisodeCanvas(frame);
    const chat = frame.contentDocument?.getElementById('chatPanel');
    if (!chat) return;
    if (chat.classList.contains('is-conversation-collapsed')) chat.querySelector('.canvas-conversation-restore')?.click();
    canvasAgentButton.setAttribute('aria-expanded', 'true');
    canvasAgentButton.classList.add('is-active');
  }, true);
  // 2026-09-17 改动逻辑：整集剪辑由第 3 步卡片按钮直接触发；force 让该入口绕过详情页内部按钮状态。
  function openCurrentVideoEditor(force = false) {
    if ((!force && (!editButton || editButton.getAttribute('aria-disabled') === 'true')) || !detailVideo) return;
    // 2026-09-16 改动逻辑：剪辑阶段固定展示一段现有演示视频，不再读取分镜卡片、生成状态或多片段列表；时间轴始终只有一个视频片段。
    const fixedVideoSource = new URL('./assets/videos/drama-broom-flight.mp4?v=20260728-original', document.baseURI).href;
    const clips = [{
      key: 'fixed-single-video',
      src: fixedVideoSource,
      title: `${episode} · 成片`,
      duration: 139
    }];
    // 2026-09-16 改动逻辑：使用新的单视频工程键避免复用此前可能为空的多片段工程，并继续隐藏剪辑阶段内部模式切换。
    const request = { key: `${episode}::fixed-single-video-v1`, title: `${episode} · 成片剪辑`, clips, hideModeSwitcher: force };
    detailVideo.pause();
    setMode('canvas');
    const frame = ensureCanvas();
    const requestId = ++editorOpenRequestId;
    let attempts = 0;
    let opened = false;
    const openWhenReady = () => {
      if (opened || requestId !== editorOpenRequestId || workspace.hidden || !openedFromEditStep) return;
      const openEditor = frame?.contentWindow?.vinaOpenEpisodeVideoComposer;
      if (typeof openEditor === 'function') {
        // 2026-09-16 修复逻辑：iframe 函数可能先于画布内部节点系统就绪；返回 false 时继续等待，不能停留在故事板画布。
        try { opened = openEditor(request) === true; } catch (error) { opened = false; }
        if (opened) {
          // 2026-09-16 修复逻辑：剪辑器异步就绪后再次同步外层画布可见性，避免首次初始化期间的模式重置把已打开的剪辑器藏在故事板后面。
          setMode('canvas');
          return;
        }
      }
      // 2026-09-16 修复逻辑：重型画布首次加载可能超过原来的 4 秒，延长等待窗口直到剪辑器真正成功打开。
      if (attempts < 600) {
        attempts += 1;
        window.setTimeout(openWhenReady, 100);
      }
    };
    // 2026-09-16 修复逻辑：iframe 完成 load 时主动补触发一次；与轮询共享 opened 状态，避免重复创建工程。
    frame?.addEventListener('load', openWhenReady, { once:true });
    openWhenReady();
  }
  // 2026-09-15 改动逻辑：父页左上返回优先关闭剪辑器，保留当前分集并进入视频提示词，阻止原返回分集列表事件。
  function returnToPrompt() {
    // 2026-09-16 修复逻辑：关闭或返回时立即作废尚未完成的首次加载轮询，防止 iframe 稍后就绪又自动弹回剪辑器。
    editorOpenRequestId += 1;
    // 2026-09-26 改动逻辑：无论由左上返回还是右侧关闭退出，立即恢复分集顶栏原状态。
    setComposerToolbarVisible(false);
    setMode('storyboard', true);
    document.body.classList.remove('libtv-composer-full-active');
    if (openedFromEditStep) {
      // 2026-09-17 改动逻辑：卡片直达的剪辑工程关闭后回到第 3 步分集视频列表，不停留在详情页。
      openedFromEditStep = false;
      document.querySelector('[data-workflow-view="episode-video"]')?.click();
      return;
    }
    workspace.querySelector('button[data-detail-view="prompt"]')?.click();
  }
  window.addEventListener('click', event => {
    const back = event.target.closest?.('.script-back');
    if (!back || !workspace.contains(back) || workspace.hidden || workspace.dataset.episodeVideoMode !== 'canvas') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    frames.get(episode)?.contentWindow?.vinaCloseEpisodeVideoComposer?.();
    returnToPrompt();
  }, true);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setMode(tab.dataset.episodeVideoMode));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next === undefined) return;
      event.preventDefault();
      setMode(tabs[next].dataset.episodeVideoMode, true);
    });
  });
  editButton?.addEventListener('click', () => openCurrentVideoEditor(false));
  // 2026-09-16 修复逻辑：暴露可直接调用且可消费待处理标记的入口；即使首次点击早于本脚本初始化，请求也不会像一次性事件一样丢失。
  function requestEpisodeEditorStep() {
    // 2026-09-17 修复逻辑：延迟消费首次入口前确认仍停留在卡片直达的分集详情；用户已返回时清除请求，避免下一帧重新打开剪辑器。
    if (workspace.hidden || !workspace.classList.contains('is-episode-edit-entry')) {
      window.__vinaPendingEpisodeEditorStep = null;
      return;
    }
    episode = title.textContent.trim();
    openedFromEditStep = true;
    window.__vinaPendingEpisodeEditorStep = null;
    openCurrentVideoEditor(true);
  }
  window.vinaRequestOpenEpisodeEditorStep = requestEpisodeEditorStep;
  window.addEventListener('vina-open-episode-editor-step', requestEpisodeEditorStep);
  // 2026-09-14：切换到其他集或重新进入分集时默认故事板；各集已创建的画布仍留在内存。
  new MutationObserver(() => {
    const next = title.textContent.trim();
    if (next !== episode) {
      episode = next;
      // 2026-09-16 修复逻辑：标题异步刷新时以当前工作流入口决定模式；剪辑步骤重新定位本集工程，只有普通分镜详情才恢复故事板。
      if (!workspace.hidden && workspace.classList.contains('is-episode-edit-entry')) requestEpisodeEditorStep();
      else setMode('storyboard');
    }
  }).observe(title, { childList:true, characterData:true, subtree:true });
  new MutationObserver(() => { if (workspace.hidden) setMode('storyboard'); })
    .observe(workspace, { attributes:true, attributeFilter:['hidden'] });
  window.addEventListener('message', event => {
    const sourceFrame = [...frames.values()].find(frame => frame.contentWindow === event.source);
    if (!sourceFrame) return;
    // 2026-09-26 改动逻辑：只接收本分集 iframe 发出的剪辑导出请求，并复用分集下载按钮的格式反馈；全能创作画布消息不进入这里。
    if (event.data?.type === 'vina-episode-editor-export-format') {
      if (!workspace.hidden && workspace.dataset.episodeVideoMode === 'canvas') {
        window.vinaRunEpisodeExportFormat?.(event.data.format);
      }
      return;
    }
    if (event.data?.type === 'vina-canvas-return-home') setMode('storyboard', true);
    // 2026-09-15 改动逻辑：从分集视频进入的剪辑器点击右上角关闭后，恢复进入前的故事板界面，而不是停留在画布模式。
    if (event.data?.type === 'vina-episode-editor-closed') returnToPrompt();
    // 2026-09-15 改动逻辑：分集画布的剪辑器全屏状态同步到父页面，沿用主画布规则隐藏右上账户栏，退出剪辑后立即恢复。
    if (event.data?.type === 'vina-libtv-composer-fullscreen') {
      document.body.classList.toggle('libtv-composer-full-active', Boolean(event.data.active));
      // 2026-09-26 改动逻辑：仅当前短剧分集剪辑全屏时显示合并后的第一行；普通画布剪辑和半屏状态沿用各自原顶栏。
      const showComposerToolbar = Boolean(event.data.active && event.data.episode && !sourceFrame.hidden && !workspace.hidden && workspace.dataset.episodeVideoMode === 'canvas');
      setComposerToolbarVisible(showComposerToolbar, sourceFrame);
    }
  });
  // 2026-09-16 修复逻辑：首次初始化直接消费剪辑入口状态，不先显示故事板再等下一帧；入口标记也可补偿待处理请求被提前消费的加载时序。
  if (!workspace.hidden && workspace.classList.contains('is-episode-edit-entry')) requestEpisodeEditorStep();
  else setMode('storyboard');
})();
