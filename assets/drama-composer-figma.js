/* 2026-10-01 Product Design 最新标注：删除输入栏三个参数代理和上传菜单。
 * 上传按钮继续由 app.js 原监听直接打开本地文件窗口；文件名显示在同一个按钮内。
 * 有文件时替换为 Figma 文档图标和删除叉号；空态文案按大纲/剧本阶段同步。
 * 保留 VinaAI 标识和发送无障碍状态同步，不改变上传/移除或生成业务。
 */
(() => {
  const workspace = document.querySelector('.script-workspace');
  const composer = workspace?.querySelector('.script-input');
  if (!composer) return;
  const upload = composer.querySelector('[data-script-chat-upload]');
  const fileLabel = composer.querySelector('[data-script-chat-file-name]');
  function syncUpload() {
    const hasFile = upload?.classList.contains('has-file');
    const icon = upload?.querySelector('img');
    const source = hasFile ? './assets/icons/drama-composer/file.svg' : './assets/icons/drama-composer/upload.svg';
    if (icon && icon.getAttribute('src') !== source) icon.setAttribute('src', source);
    const text = hasFile ? (fileLabel?.title || fileLabel?.textContent || '剧本文件') : '上传剧本';
    upload?.setAttribute('aria-label', hasFile ? `已上传剧本：${text}，点击替换文件` : '上传剧本');
    if (upload) upload.title = hasFile ? text : '上传剧本';
  }
  if (upload) new MutationObserver(syncUpload).observe(upload, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true, characterData: true });
  syncUpload();
  function syncStateCopy() {
    const episode = workspace.dataset.scriptStage === 'episode';
    const title = workspace.querySelector('[data-script-empty-title]');
    const text = episode ? '暂无剧本内容' : '暂无剧本大纲内容';
    if (title && title.textContent !== text) title.textContent = text;
    workspace.querySelectorAll('[data-script-state-next]').forEach(button => { button.textContent = episode ? '下一步' : '生成分集剧本详情'; });
  }
  new MutationObserver(syncStateCopy).observe(workspace, { attributes: true, attributeFilter: ['data-script-stage'] });
  syncStateCopy();
  const conversation = workspace.querySelector('[data-script-conversation]');
  function syncWordmarks() {
    workspace.querySelectorAll('.script-ai-head').forEach(head => {
      if (head.querySelector('.script-ai-wordmark')) return;
      const wordmark = document.createElement('img');
      wordmark.className = 'script-ai-wordmark';
      wordmark.src = './assets/icons/drama-composer/vina-ai.svg';
      wordmark.alt = 'VinaAI';
      head.replaceChildren(wordmark);
    });
  }
  if (conversation) new MutationObserver(syncWordmarks).observe(conversation, { subtree: true, childList: true });
  syncWordmarks();
  const send = composer.querySelector('[data-script-send]');
  function syncSend() { send?.setAttribute('aria-disabled', String(send.disabled || send.classList.contains('is-locked'))); }
  if (send) new MutationObserver(syncSend).observe(send, { attributes: true, attributeFilter: ['disabled', 'class'] });
  syncSend();
})();
