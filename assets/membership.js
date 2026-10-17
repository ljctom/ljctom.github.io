// 2026-10-01：会员页关闭时优先返回浏览历史中的上一页面；直接打开且无上一页时返回首页。
(function () {
  const closeButton = document.querySelector('.membership-close');
  if (!closeButton) return;

  closeButton.addEventListener('click', function () {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = './index.html';
  });
})();
