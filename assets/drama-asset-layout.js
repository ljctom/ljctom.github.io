/* 2026-09-30 Product Design：仅重排现有资产编辑器，所有业务按钮仍为原 DOM 节点。
   左侧形象入口转发到原形象按钮；不复制提示词、图片历史、音色或生成状态。 */
(() => {
  function initialize() {
    const workspace = document.querySelector('.asset-workspace');
    const inner = workspace?.querySelector('.asset-inner');
    if (!inner || inner.querySelector('.asset-browser-sidebar')) return;
    const toolbar = inner.querySelector('.asset-toolbar');
    const actions = workspace.querySelector('.asset-stage-actions');
    const sidebar = document.createElement('aside');
    sidebar.className = 'asset-browser-sidebar';
    sidebar.setAttribute('aria-label', '资产分类与形象列表');
    const list = document.createElement('div');
    list.className = 'asset-browser-list';
    const add = document.createElement('div');
    add.className = 'asset-browser-add';
    add.append(toolbar.querySelector('#assetAddCharacter'));
    actions.prepend(toolbar.querySelector('.asset-view-controls'));
    toolbar.querySelector('.asset-toolbar-actions').remove();
    sidebar.append(toolbar, list, add);
    inner.prepend(sidebar);
    // 2026-09-30 Product Design 改动逻辑：把三个分类的原资产网格与底部原按钮统一移入右侧面板，
    // 外框与左侧列表共用同一网格行实现等高；操作行独立占位并靠右下，不覆盖编辑内容。
    // 仅移动原 DOM 节点，保留分类切换、画布编辑、批量生成与下一步的已有事件和状态。
    const panel = document.createElement('section');
    panel.className = 'asset-browser-detail-panel';
    panel.setAttribute('aria-label', '资产预览与编辑');
    panel.append(...inner.querySelectorAll('.asset-grid'), actions);
    inner.append(panel);
    workspace.classList.add('has-asset-browser');
    const groups = new Map();
    const selectedByType = new Map();
    let queued = false;

    // 保留每个分类的选中资产；只改变卡片显示，不重建编辑器或清空用户输入。
    function select(card) {
      selectedByType.set(card.dataset.assetGroupType, card);
      sync();
    }
    function arrange(card) {
      const editor = card.querySelector('.is-inline-editor');
      const right = editor?.querySelector('.drama-character-editor-right');
      if (!right || right.querySelector('.asset-preview-region')) return;
      const details = editor.querySelector('.drama-character-editor-left');
      const title = editor.querySelector('.drama-character-editor-head h2');
      const previewHead = right.querySelector('.drama-character-preview-head');
      const preview = document.createElement('section');
      preview.className = 'asset-preview-region';
      preview.setAttribute('aria-label', '当前使用图片');
      const editing = document.createElement('section');
      editing.className = 'asset-edit-region';
      editing.setAttribute('aria-label', '资产描述、音色与图片生成');
      // 2026-09-30 Product Design 改动逻辑：把原标题节点移进图片卡片首行，和“当前使用图片”并列；保留标题 id，继续供无障碍标签和原编辑器逻辑复用。
      title.classList.add('asset-preview-title');
      title.dataset.assetPreviewTitle = '';
      previewHead.prepend(title);
      // 2026-09-30 Product Design 改动逻辑：预览卡只保留当前图片；原形象按钮留在 details 中供左侧单层卡片转发点击，资产页不再重复展示切换条。
      preview.append(previewHead, right.querySelector('[data-character-current]'));
      // 描述、音色与原形象按钮留在 details 容器内，确保类型隐藏规则和事件代理继续生效。
      editing.append(details, ...Array.from(right.children));
      // 2026-09-30 Product Design 改动逻辑：把原参数和生成按钮节点移入提示词外框底部，保留事件与菜单状态。
      // 只有 textarea 可输入；操作栏显式不可编辑，与正文独立占位，输入或滚动不会覆盖按钮行。
      const promptField = editing.querySelector('.drama-character-prompt-field');
      const sourceActions = editing.querySelector('.drama-character-source-actions');
      sourceActions.setAttribute('contenteditable', 'false');
      promptField.append(sourceActions);
      right.append(preview, editing);
    }
    function displayName(card, source) {
      const groupName = card.dataset.assetGroupName || '';
      const rawName = source?.querySelector('.drama-character-variant-copy strong')?.textContent?.trim() || groupName;
      const variantName = rawName === groupName ? (card.dataset.assetGroupType === 'character' ? '基础形象' : '') : rawName.startsWith(`${groupName}-`) ? rawName.slice(groupName.length + 1) : rawName;
      return variantName ? `${groupName} · ${variantName}` : groupName;
    }
    function sync() {
      observer.disconnect();
      const type = toolbar.querySelector('.asset-tab.active')?.dataset.assetPanelTarget || 'character';
      const cards = Array.from(inner.querySelectorAll('.asset-grid > [data-asset-group-name]'));
      const current = cards.filter(card => card.dataset.assetGroupType === type);
      if (!current.includes(selectedByType.get(type))) selectedByType.set(type, current[0]);
      for (const card of cards) {
        arrange(card);
        let group = groups.get(card);
        if (!group) {
          group = document.createElement('section');
          group.className = 'asset-browser-group';
          // 2026-09-30 Product Design 改动逻辑：每个形象仍是独立可点的行；仅多形象角色在外层显示柔和背景，不增加重复角色标题。
          group.append(document.createElement('div'));
          list.append(group);
          groups.set(card, group);
        }
        const selected = selectedByType.get(type) === card;
        card.classList.toggle('is-browser-selected', selected);
        group.hidden = card.dataset.assetGroupType !== type;
        group.classList.toggle('is-selected', selected);
        const sourceButtons = Array.from(card.querySelectorAll('[data-character-variant-index]'));
        // 2026-09-30 Product Design 改动逻辑：标题跟随当前选中的形象更新，切换左侧形象后不会只剩角色名；单形象的场景与物品维持原名。
        const activeSource = sourceButtons.find(button => button.classList.contains('active')) || sourceButtons[0];
        const previewTitle = card.querySelector('[data-asset-preview-title]');
        if (previewTitle) previewTitle.textContent = displayName(card, activeSource);
        group.classList.toggle('is-multi-variant', card.dataset.assetGroupType === 'character' && sourceButtons.length > 1);
        // 2026-09-30 Product Design 修复逻辑：选中态由下方逐行同步，不纳入重建签名；
        // 避免仅切换 active 就替换整组按钮，保留鼠标目标与键盘焦点，内容或生成状态变化时仍正常重建。
        const signature = JSON.stringify(sourceButtons.map(button => [button.innerHTML, button.getAttribute('aria-label')]));
        if (group.dataset.signature !== signature) {
          group.dataset.signature = signature;
          const rows = sourceButtons.map((source, index) => {
            const row = source.cloneNode(true);
            row.removeAttribute('data-character-variant-index');
            row.className = 'asset-browser-row';
            row.dataset.variantIndex = String(index);
            // 2026-09-30 Product Design 改动逻辑：列表和图片标题共用同一名称格式，基础形象自动补名，场景和物品不重复。
            const name = displayName(card, source);
            row.querySelector('.drama-character-variant-copy strong').textContent = name;
            // 2026-09-30 Product Design 修复逻辑：名称和状态已在行内展示，只保留完整辅助名称；
            // 克隆时移除原按钮的 title，不再生成浏览器原生提示，避免重绘或切页后灰色标签残留。
            row.removeAttribute('title');
            row.setAttribute('aria-label', `${name} · ${source.querySelector('.drama-character-variant-copy span')?.textContent?.trim() || ''}`);
            row.addEventListener('click', () => {
              select(card);
              // 重新查询原按钮，避免生成或历史切换重绘后引用已经脱离页面的按钮。
              card.querySelectorAll('[data-character-variant-index]')[index]?.click();
              sync();
            });
            return row;
          });
          if (!rows.length) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'asset-browser-row is-loading';
            row.textContent = `${card.dataset.assetGroupName} · 正在加载资产…`;
            row.addEventListener('click', () => select(card));
            rows.push(row);
          }
          group.lastElementChild.replaceChildren(...rows);
        }
        group.querySelectorAll('.asset-browser-row').forEach((row, index) => {
          const active = selected && Boolean(sourceButtons[index]?.classList.contains('active'));
          row.classList.toggle('active', active);
          row.setAttribute('aria-pressed', String(active));
        });
      }
      // 分集编辑弹窗会临时借走原卡片；保留分组引用，归还时自动恢复原选中项。
      for (const [card, group] of groups) {
        if (!card.isConnected) { group.remove(); groups.delete(card); }
      }
      observer.observe(inner, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'title', 'aria-busy'] });
    }
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; sync(); });
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
