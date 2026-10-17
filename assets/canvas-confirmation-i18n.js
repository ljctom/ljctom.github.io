/* 2026-10-12 Product Design / 多语言改动逻辑：
 * 仅翻译全能创作确认卡的跳过、继续和已确认按钮；不翻译用户输入、AI 正文或预置项目数据。
 * 通过同源父页面的 html.lang 同步中文、英文、日语、法语及马来语；动态出现的新卡与已有卡同步更新。
 * 点击行为继续由原 data-confirmation-* 入口处理，跳过仍发送中文规范指令，避免译文影响直接生成判定。
 * 根据实际按钮宽度与字体测量缩小字号，配合 nowrap 保留完整单行文案；拖拽栏宽和字体加载完成后重新适配。
 */
(() => {
  const labels = {
    "zh-CN": { skip: "跳过，直接生成", continue: "继续", confirmed: "已确认" },
    en: { skip: "Skip & generate", continue: "Continue", confirmed: "Confirmed" },
    ja: { skip: "スキップして生成", continue: "続ける", confirmed: "確認済み" },
    fr: { skip: "Ignorer et générer", continue: "Continuer", confirmed: "Confirmé" },
    ms: { skip: "Langkau & jana", continue: "Teruskan", confirmed: "Disahkan" }
  };
  const selector = '.creative-skip, [data-confirmation-continue]';
  const knownStates = new Map();
  Object.values(labels).forEach(copy => {
    knownStates.set(copy.continue, 'continue');
    knownStates.set(copy.confirmed, 'confirmed');
  });

  function install() {
    if (document.getElementById('character-asset-canvas-theme')) return;
    let parentRoot = document.documentElement;
    try { parentRoot = window.parent.document.documentElement; } catch (_) { /* 非同源宿主使用当前画布语言。 */ }
    let scheduled = false;
    const observed = new WeakSet();
    const measure = document.createElement('canvas').getContext('2d');

    function currentLanguage() {
      const value = parentRoot.lang || 'zh-CN';
      const normalized = value.startsWith('zh') ? 'zh-CN' : value.split('-')[0];
      return Object.prototype.hasOwnProperty.call(labels, normalized) ? normalized : 'zh-CN';
    }

    function fitButton(button) {
      if (!button.isConnected) { resizeObserver?.unobserve(button); return; }
      if (!measure || !button.clientWidth) return;
      const style = window.getComputedStyle(button);
      const available = button.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - 2;
      if (available <= 0) return;
      // 以原 14px 字号测量，栏宽恢复时同样恢复字号，避免连续缩小或改变按钮分栏比例。
      measure.font = `${style.fontStyle} ${style.fontWeight} 14px ${style.fontFamily}`;
      const text = button.textContent.trim();
      const spacing = (parseFloat(style.letterSpacing) || 0) * Math.max(0, Array.from(text).length - 1);
      const measured = measure.measureText(text).width + spacing;
      const size = Math.max(1, Math.floor(Math.min(14, 14 * available / Math.max(1, measured)) * 10) / 10);
      const nextSize = `${size}px`;
      if (button.style.getPropertyValue('font-size') !== nextSize) button.style.setProperty('font-size', nextSize, 'important');
    }

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
      entries.forEach(entry => fitButton(entry.target));
    }) : null;

    function syncButtons() {
      const lang = currentLanguage();
      const copy = labels[lang];
      document.querySelectorAll(selector).forEach(button => {
        const state = button.classList.contains('creative-skip') ? 'skip' : knownStates.get(button.textContent.trim());
        // 未知业务状态保持原有文案，例如失败、提交中等，不强行替换为“继续”。
        if (!state) return;
        const text = copy[state];
        if (button.textContent !== text) button.textContent = text;
        if (button.getAttribute('aria-label') !== text) button.setAttribute('aria-label', text);
        if (button.getAttribute('title') !== text) button.setAttribute('title', text);
        if (button.getAttribute('lang') !== lang) button.setAttribute('lang', lang);
        if (resizeObserver && !observed.has(button)) { observed.add(button); resizeObserver.observe(button); }
        fitButton(button);
      });
    }

    function scheduleSync() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; syncButtons(); });
    }

    new MutationObserver(scheduleSync).observe(parentRoot, { attributes: true, attributeFilter: ['lang'] });
    new MutationObserver(scheduleSync).observe(document.getElementById('messages') || document.body, {
      childList: true, subtree: true, characterData: true
    });
    window.addEventListener('resize', scheduleSync);
    if (document.fonts) {
      document.fonts.ready.then(scheduleSync);
      document.fonts.addEventListener('loadingdone', scheduleSync);
    }
    syncButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
