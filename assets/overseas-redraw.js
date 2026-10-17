// 2026-09-14 改动逻辑：父页面只负责上传入口；独立 iframe 复用短剧第二、三步，所有流程变量、DOM、资产画布与分镜状态均在子页面隔离。
(() => {
  const embedded = document.documentElement.classList.contains('redraw-embedded');
  const $ = selector => document.querySelector(selector);
  const validFiles = files => Array.from(files).filter(file => /\.(mp4|mov)$/i.test(file.name));
  if (!embedded) {
    const dialog = $('#overseasRedrawDialog');
    const input = $('[data-redraw-input]');
    const zone = $('[data-redraw-dropzone]');
    const homeUploadButton = $('[data-home-remake-video-upload]');
    const homeUploadInput = $('[data-home-remake-video-input]');
    const homeUploadName = $('[data-home-remake-video-name]');
    let frame;
    let returnFocus;
    let oldOverflow;
    document.querySelectorAll('[data-overseas-redraw-open]').forEach(button => button.addEventListener('click', () => {
      returnFocus = button;
      if (frame) { frame.hidden = false; oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; frame.focus(); }
      else dialog.showModal();
    }));
    $('[data-redraw-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const r = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
    });
    function enter(files, opener = returnFocus, allowEmpty = false) {
      // 2026-09-26 Product Design 改动逻辑：左键按实际选择的视频文件名生成分集；右键入口按三集示例原片进入。
      const selectedFiles = validFiles(files).slice(0, 50);
      if (!selectedFiles.length && !allowEmpty) { $('[data-redraw-status]').textContent = '请选择 MP4 或 MOV 视频文件'; return false; }
      const seedNames = selectedFiles.length
        ? selectedFiles.map(file => file.name)
        : Array.from({ length: 3 }, (_, index) => `示例原片${String(index + 1).padStart(2, '0')}.mp4`);
      returnFocus = opener || returnFocus;
      if (dialog.open) dialog.close();
      input.value = '';
      // 2026-09-26 改动逻辑：每次从首页开启新转绘项目时释放上一个已退出的 iframe，避免隐藏实例继续占用页面和保留旧分集。
      frame?.remove();
      frame = document.createElement('iframe');
      frame.className = 'redraw-workflow-frame';
      frame.title = '出海转绘独立工作流';
      const url = new URL(location.href);
      url.searchParams.set('workflow', 'overseas-redraw');
      // 2026-09-26 改动逻辑：文件名放在本次 iframe 地址的 hash 中，子页初始化时直接读取，避免加载消息早于列表监听导致显示 0 集。
      url.hash = new URLSearchParams({ 'redraw-files': JSON.stringify(seedNames) }).toString();
      frame.src = url.href;
      oldOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.append(frame);
      frame.focus();
      return true;
    }
    // 2026-09-26 改动逻辑：首页上传按钮与右键快捷入口共用本脚本的转绘入口，文件选择不再依赖主应用脚本的初始化顺序。
    window.vinaOpenOverseasRedrawWorkflow = (files, opener) => enter(files, opener);
    homeUploadButton?.addEventListener('click', () => homeUploadInput?.click());
    homeUploadInput?.addEventListener('change', () => {
      const files = Array.from(homeUploadInput.files || []);
      if (files.length) {
        if (homeUploadName) homeUploadName.textContent = files.length === 1 ? files[0].name : `已选择 ${files.length} 个视频`;
        enter(files, homeUploadButton);
      }
      homeUploadInput.value = '';
      if (homeUploadName) homeUploadName.textContent = '上传视频';
    });
    homeUploadButton?.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      enter([], event.currentTarget, true);
    });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('change', () => enter(input.files));
    ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('is-dragging'); }));
    zone.addEventListener('dragleave', event => { if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-dragging'); });
    zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); enter(event.dataTransfer.files); });
    window.addEventListener('message', event => {
      if (event.source !== frame?.contentWindow || event.data?.type !== 'vina-redraw-exit') return;
      frame.hidden = true;
      document.body.style.overflow = oldOverflow;
      returnFocus?.focus();
    });
    return;
  }

  function initialize() {
    // 2026-09-26 改动逻辑：进入转绘 iframe 时立即启用短剧全屏布局和首步状态，后续初始化即使延迟也不暴露首页顶栏、侧栏或遮住进度条。
    document.body.classList.add('drama-workflow-active');
    document.body.dataset.redrawStep = 'redraw-original';
    // 2026-09-26 改动逻辑：子页面一旦有 DOM 就先展示上传原片页并解除遮罩；后续列表初始化异常时也不会留下整页空白。
    document.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.dataset.view !== 'redraw-original'; });
    document.documentElement.classList.add('redraw-ready');
    // 2026-09-26 Product Design 改动逻辑：进入转绘页就按入口带来的文件名建立原片队列，右键入口自然显示三集示例。
    const covers = ['linear-gradient(135deg,#302821,#977040 50%,#11100e)', 'linear-gradient(135deg,#172735,#7694a6 45%,#222033)', 'linear-gradient(135deg,#554127,#c29a4a 50%,#201b16)'];
    const seedNames = (() => {
      try {
        const names = JSON.parse(new URLSearchParams(location.hash.slice(1)).get('redraw-files'));
        return Array.isArray(names) ? names : [];
      } catch { return []; }
    })();
    let episodes = seedNames.slice(0, 50).map((filename, index) => ({
      id: index + 1,
      name: `第 ${index + 1} 集`,
      filename: String(filename || `原片 ${index + 1}.mp4`),
      duration: '00:30',
      cover: covers[index % covers.length]
    }));
    let serial = episodes.length;
    let chosenStyle = '';
    let chosenRegion = '';
    // 2026-09-30 Product Design 改动逻辑：转绘复用剧本创作的三分类和真实封面目录，选择与自定义草稿仅保存在当前转绘实例。
    let category = 'live';
    let customStyleDescription = '';
    const redrawStyleCategories = [
      { id: 'live', name: 'AI真人剧' },
      { id: 'comic', name: 'AI漫剧' },
      { id: 'custom', name: '自定义' }
    ];
    const redrawStyleCatalog = Array.from(document.querySelectorAll('[data-script-setup-style]')).map(card => ({
      id: card.dataset.scriptSetupStyle,
      name: card.dataset.scriptSetupStyleName,
      category: card.dataset.scriptSetupStyleCategory,
      image: card.querySelector('img')?.getAttribute('src') || ''
    }));
    let replaceId = null;
    let dragging = null;
    const sourceInput = $('[data-redraw-source-input]');
    const grid = $('[data-redraw-original-grid]');
    const notice = $('[data-redraw-notice]');
    // 2026-09-26 Product Design 改动逻辑：转绘首步的缺失国家提示复用独立 toast 节点，并在重复点击时重新计时。
    const validationToast = $('[data-redraw-toast]');
    let validationToastTimer = 0;
    function showValidationToast(message) {
      validationToast.textContent = message;
      validationToast.hidden = false;
      window.clearTimeout(validationToastTimer);
      validationToastTimer = window.setTimeout(() => { validationToast.hidden = true; }, 2400);
    }
    const stylePanel = $('#redrawStylePanel');
    const regionPanel = $('#redrawRegionPanel');
    const styleToggle = $('[data-redraw-style-toggle]');
    const regionToggle = $('[data-redraw-region-toggle]');
    const originalEpisodeCard = $('[data-episode-card]').cloneNode(true);
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function pickFiles(id = null) { replaceId = id; sourceInput.multiple = id === null; sourceInput.click(); }
    // 2026-09-14 修正逻辑：集数编号按当前数组位置计算，素材 ID 与自定义集名随原片移动；排序、删除和新增后统一重排显示编号。
    function displayEpisodeName(episode, index) {
      const customName = /^第\s*\d+\s*集$/.test(episode.name) ? '' : episode.name;
      return `第 ${index + 1} 集${customName ? `：${customName}` : ''}`;
    }
    function render() {
      grid.innerHTML = episodes.map((episode, i) => `<article class="redraw-original-card" data-source-id="${episode.id}"><div class="redraw-drag-handle" draggable="true" title="拖动调整分集顺序" aria-label="拖动调整分集顺序">⠿</div><div class="redraw-source-cover" style="background:${episode.cover}"><span>${episode.duration}</span></div><div class="redraw-source-info"><div class="redraw-source-title"><input data-source-name="${episode.id}" value="${escape(displayEpisodeName(episode, i))}" maxlength="60" aria-label="第 ${i+1} 个分集名称"><span>未解析</span></div><p>${episode.duration} <span>｜</span> ${escape(episode.filename)}</p><div class="redraw-source-actions"><button type="button" data-source-replace="${episode.id}">⟳ 重新上传</button><button type="button" class="redraw-source-delete" data-source-delete="${episode.id}">♧ 删除</button><button type="button" data-source-up="${episode.id}" ${i===0?'disabled':''} aria-label="上移 ${escape(displayEpisodeName(episode, i))}">↑</button><button type="button" data-source-down="${episode.id}" ${i===episodes.length-1?'disabled':''} aria-label="下移 ${escape(displayEpisodeName(episode, i))}">↓</button></div></div></article>`).join('');
      $('[data-redraw-total]').textContent = `共 ${episodes.length} 集`;
      $('[data-redraw-confirm]').disabled = !episodes.length;
    }
    function move(id, offset) {
      const from = episodes.findIndex(item => item.id === id), to = from + offset;
      if (from < 0 || to < 0 || to >= episodes.length) return;
      episodes.splice(to, 0, episodes.splice(from, 1)[0]); render();
    }
    grid.addEventListener('change', event => {
      const id = Number(event.target.dataset.sourceName);
      const episode = episodes.find(item => item.id === id);
      if (episode) {
        // 编辑只保存集名，去除显示编号；编号始终由当前位置生成，不能跟随旧分集位置残留。
        const index = episodes.indexOf(episode);
        episode.name = event.target.value.trim().replace(/^第\s*\d+\s*集\s*[:：]?\s*/, '') || `第 ${index+1} 集`;
        event.target.value = displayEpisodeName(episode, index);
      }
    });
    grid.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.sourceReplace) pickFiles(Number(button.dataset.sourceReplace));
      if (button.dataset.sourceDelete) { episodes = episodes.filter(item => item.id !== Number(button.dataset.sourceDelete)); render(); }
      if (button.dataset.sourceUp) move(Number(button.dataset.sourceUp), -1);
      if (button.dataset.sourceDown) move(Number(button.dataset.sourceDown), 1);
    });
    grid.addEventListener('dragstart', event => { dragging = Number(event.target.closest('[data-source-id]')?.dataset.sourceId); event.dataTransfer.setData('text/plain', String(dragging)); event.dataTransfer.effectAllowed = 'move'; });
    grid.addEventListener('dragover', event => { if (dragging) event.preventDefault(); });
    grid.addEventListener('drop', event => {
      event.preventDefault(); const target = Number(event.target.closest('[data-source-id]')?.dataset.sourceId);
      const from = episodes.findIndex(item => item.id === dragging), to = episodes.findIndex(item => item.id === target);
      if (from >= 0 && to >= 0) move(dragging, to-from);
      dragging = null;
    });
    grid.addEventListener('dragend', () => { dragging = null; });
    $('[data-redraw-add]').addEventListener('click', () => pickFiles());
    sourceInput.addEventListener('change', () => {
      const files = validFiles(sourceInput.files);
      if (!files.length) { notice.textContent = '请选择 MP4 或 MOV 视频文件'; return; }
      if (replaceId !== null) {
        const item = episodes.find(episode => episode.id === replaceId);
        if (item) { item.filename = files[0].name; item.cover = covers[(covers.indexOf(item.cover)+1)%3]; }
      } else {
        const room = Math.max(0, 50-episodes.length);
        files.slice(0, room).forEach(file => { serial++; episodes.push({id:serial, name:`第 ${episodes.length+1} 集`, filename:file.name, duration:'00:30', cover:covers[(serial-1)%3]}); });
        notice.textContent = files.length > room ? '一次最多添加 50 集原片' : '';
      }
      sourceInput.value = ''; replaceId = null; render();
    });
    function closePanels() { stylePanel.hidden = regionPanel.hidden = true; styleToggle.setAttribute('aria-expanded','false'); regionToggle.setAttribute('aria-expanded','false'); }
    // 2026-09-14 修正逻辑：面板始终向上展开，并按视口钳制横向位置，避免宽风格面板在小屏或左侧触发器下越界。
    function positionPanel(panel, button) {
      const rect = button.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.right = 'auto';
      panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth-panel.offsetWidth-12))}px`;
      panel.style.bottom = `${innerHeight-rect.top+12}px`;
      // 2026-09-30 Product Design 改动逻辑：同款风格弹窗宽度为 760px、高度最多 460px，始终贴按钮上方并限制在视口内，标题分类不参与滚动。
      panel.style.maxHeight = `${Math.max(0, Math.min(panel === stylePanel ? 460 : 570, rect.top-24))}px`;
    }
    function togglePanel(panel, button) { const open = panel.hidden; closePanels(); panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); if(open) positionPanel(panel, button); }
    window.addEventListener('resize', () => { if(!stylePanel.hidden) positionPanel(stylePanel,styleToggle); if(!regionPanel.hidden) positionPanel(regionPanel,regionToggle); });
    window.addEventListener('vina-view-changed', event => { closePanels(); document.body.dataset.redrawStep = event.detail.target; });
    styleToggle.addEventListener('click', () => togglePanel(stylePanel, styleToggle));
    regionToggle.addEventListener('click', () => togglePanel(regionPanel, regionToggle));
    document.addEventListener('click', event => { if (!event.target.closest('.redraw-setting')) closePanels(); });
    document.addEventListener('keydown', event => { if(event.key === 'Escape') { const opener = !stylePanel.hidden ? styleToggle : !regionPanel.hidden ? regionToggle : null; closePanels(); opener?.focus(); } });
    // 2026-09-30 Product Design 改动逻辑：直接读取与剧本创作相同的静态画风卡片，复用卡片样式；选择后保留弹窗和选中边框，点击外部或 Escape 收起。
    function syncStyleLabel() {
      const name = chosenStyle === 'custom' ? '自定义' : redrawStyleCatalog.find(item => item.id === chosenStyle)?.name;
      $('[data-redraw-style-label]').textContent = name || '风格';
      styleToggle.setAttribute('aria-label', name ? `当前风格：${name}` : '选择风格');
    }
    function renderStyles() {
      $('[data-redraw-style-tabs]').innerHTML = redrawStyleCategories.map(item => `<button class="style-category${category === item.id ? ' is-active' : ''}" type="button" role="tab" data-redraw-category="${item.id}" aria-selected="${category === item.id}">${item.name}</button>`).join('');
      const list = $('[data-redraw-style-grid]');
      list.setAttribute('role', category === 'custom' ? 'group' : 'listbox');
      if (category === 'custom') {
        list.innerHTML = `<div class="home-drama-custom-style"><label for="redrawCustomStyle">画风描述</label><textarea id="redrawCustomStyle" data-redraw-custom-style aria-label="自定义画风" placeholder="描述你希望使用的画风，例如：暖色赛博朋克，融合东方建筑与电影感光影。">${escape(customStyleDescription)}</textarea></div>`;
        return;
      }
      list.innerHTML = redrawStyleCatalog.filter(item => item.category === category).map(item => `<button class="home-drama-style-card${chosenStyle === item.id ? ' is-selected' : ''}" type="button" role="option" data-redraw-style="${escape(item.id)}" aria-selected="${chosenStyle === item.id}"><img src="${escape(item.image)}" alt="${escape(item.name)}风格预览" loading="lazy"><span>${escape(item.name)}</span></button>`).join('');
    }
    stylePanel.addEventListener('click', event => {
      const tab = event.target.closest('[data-redraw-category]'), option = event.target.closest('[data-redraw-style]');
      if (tab) {
        category = tab.dataset.redrawCategory;
        if (category === 'custom') { chosenStyle = 'custom'; syncStyleLabel(); }
        renderStyles();
        $('[data-redraw-style-grid]').scrollTo({ top: 0 });
      }
      if (option) {
        chosenStyle = option.dataset.redrawStyle;
        syncStyleLabel();
        stylePanel.querySelectorAll('[data-redraw-style]').forEach(button => {
          const selected = button === option;
          button.classList.toggle('is-selected', selected);
          button.setAttribute('aria-selected', String(selected));
        });
      }
    });
    // 2026-09-30 改动逻辑：自定义描述跨分类切换保留，解析时随风格 ID 一起交给转绘流程。
    stylePanel.addEventListener('input', event => {
      if (!event.target.matches('[data-redraw-custom-style]')) return;
      customStyleDescription = event.target.value;
      chosenStyle = 'custom';
      syncStyleLabel();
    });
    const countries = ['美国','英国','加拿大','澳大利亚','德国','法国','日本','韩国','巴西','印度'];
    $('[data-redraw-regions]').innerHTML = countries.map(name => `<button type="button" data-redraw-country="${name}" aria-pressed="false">${name}<span>✓</span></button>`).join('');
    regionPanel.addEventListener('click', event => {
      const option = event.target.closest('[data-redraw-country]'); if(!option) return;
      chosenRegion = option.dataset.redrawCountry;
      $('[data-redraw-region-label]').textContent = chosenRegion;
      regionPanel.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(button===option)));
      closePanels(); regionToggle.focus();
    });
    // 2026-09-22 改动逻辑：仅在转绘 iframe 内移除普通短剧的分集剧本步骤及前置连接线，保留上传原片、资产、分集视频三个入口。
    document.querySelectorAll('.steps [data-script-phase="episode"]').forEach(button => {
      if (button.previousElementSibling?.classList.contains('step-line')) button.previousElementSibling.remove();
      button.remove();
    });
    document.querySelectorAll('.steps [data-workflow-view]').forEach(button => {
      button.removeAttribute('data-script-phase');
      const number = button.querySelector('.step-num');
      const step = { 'script-studio': '1', 'asset-library': '2', 'episode-video': '3' }[button.dataset.workflowView];
      if (number && step && !button.classList.contains('complete')) number.textContent = step;
    });
    // 保留现有步骤事件，上传原片通过独立流程路由返回首步，不再进入普通剧本的分阶段处理。
    document.querySelectorAll('[data-workflow-view="script-studio"]').forEach(button => {
      Array.from(button.childNodes).filter(node => node.nodeType===Node.TEXT_NODE).forEach(node => node.textContent = '上传原片');
    });
    document.querySelectorAll('[data-script-project-title]').forEach(node => { node.textContent = '出海转绘'; });
    function syncEpisodes() {
      const target = $('[data-view="episode-video"] .episode-grid');
      target.replaceChildren();
      episodes.forEach((episode, i) => {
        const card = originalEpisodeCard.cloneNode(true);
        const title = /^第\s*\d+\s*集$/.test(episode.name) ? `第${i+1}集` : `第${i+1}集：${episode.name}`;
        // 每次改名或排序前保存稳定分集 ID 对应的状态，避免第三步按显示标题索引时互相串集。
        if (episode.videoState) episodeVideoStates.set(title, episode.videoState);
        else episode.videoState = getEpisodeVideoState(`redraw-source-${episode.id}`);
        episodeVideoStates.set(title, episode.videoState);
        card.dataset.episodeTitle = title;
        card.querySelector('.episode-name').textContent = title;
        card.querySelector('.episode-cover').style.setProperty('--cover',episode.cover);
        card.querySelector('.episode-duration').textContent = episode.duration;
        const opener = card.querySelector('[data-open-episode-detail]');
        opener.dataset.episodeTitle = title;
        opener.addEventListener('click', () => {
          persistCurrentEpisodeShotState(currentEpisodeVideoTitle);
          currentEpisodeVideoTitle = title;
          restoreEpisodeShotState(title);
          setEpisodeDetailTitle(title);
          setActiveShot(document.querySelector('.shot-card.active') || shotCards[0]);
          applyDetailVersionPreview(activeScriptVersionId);
          showView('episode-detail');
        });
        card.querySelectorAll('[data-episode-action]').forEach(bindEpisodeActionButton);
        target.append(card);
      });
      // 2026-10-11 修复：视频总览已改用项目概览集数标签；更新现有标签并容忍其缺失，避免旧 .episode-sub 选择器抛错阻断确认解析。
      const episodeCount = $('[data-view="episode-video"] [data-episode-project-count]');
      if (episodeCount) episodeCount.textContent = `共 ${episodes.length} 集`;
    }
    $('[data-redraw-confirm]').addEventListener('click', () => {
      if (!episodes.length) return;
      // 2026-09-26 改动逻辑：点击下一步时先要求选择转绘目标国家；未选择则 toast 提示，并停留在上传原片页。
      if (!chosenRegion) { showValidationToast('请先选择要转绘的目标国家'); return; }
      closePanels(); syncEpisodes();
      // 原型沿用现有资产解析等待态；风格、目标国家作为转绘参数保存，不改写普通短剧的配置。
      document.body.dataset.redrawStyle = chosenStyle;
      // 2026-09-30 改动逻辑：预设画风不携带旧自定义描述，自定义画风保存当前输入供后续解析使用。
      document.body.dataset.redrawCustomStyle = chosenStyle === 'custom' ? customStyleDescription.trim() : '';
      document.body.dataset.redrawRegion = chosenRegion;
      showView('asset-library');
      showAssetParsingPrototypeState();
    });
    $('.asset-parsing-state').textContent = '正在解析原片并生成角色场景资产中，请稍后...';
    const exit = () => { if (parent !== window) parent.postMessage({type:'vina-redraw-exit'}, '*'); else location.href = location.pathname; };
    $('[data-redraw-exit]').addEventListener('click', exit);
    const exitButton = document.createElement('button');
    exitButton.type = 'button'; exitButton.className = 'redraw-exit-fixed'; exitButton.textContent = '退出转绘'; exitButton.addEventListener('click', exit); document.body.append(exitButton);
    // 2026-09-26 改动逻辑：首轮渲染直接使用地址里的分集数量及原文件名，避免先展示空队列。
    notice.textContent = seedNames.length > 50 ? '一次最多添加 50 集原片' : '';
    render(); renderStyles(); syncEpisodes();
    showView('redraw-original');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true}); else initialize();
})();
