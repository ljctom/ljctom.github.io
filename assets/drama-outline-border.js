/* 2026-10-10 改动逻辑：第二、第三步复用设计参考的鼠标局部边框光效。
 * 事件委托覆盖动态卡片，只通过 requestAnimationFrame 更新 CSS 坐标；
 * 不拦截事件、不修改发送/提交/编辑状态，不作用于设定、资产或视频步骤。 */
(() => {
  const scope='.script-workspace[data-view="script-studio"]:is([data-script-stage="empty"],[data-script-stage="overall"],[data-script-stage="episode"]):not([data-setup-page="true"])';
  const targets='.script-input,.script-detail .story-summary,.script-detail .subject-card,.script-detail .scene-card,.script-detail .script-scene-card';
  let frame=0, pending=null;
  document.addEventListener('pointermove',event=>{
    const card=event.target.closest?.(targets);
    if(!card?.closest(scope) || card.matches('.script-episode-summary-card'))return;
    if(!card.matches('.script-input,[contenteditable="true"],[contenteditable="plaintext-only"]') && !card.querySelector('[contenteditable="true"],[contenteditable="plaintext-only"],textarea:not(:disabled)'))return;
    pending={card,x:event.clientX,y:event.clientY};
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      const {card,x,y}=pending;
      if(!card.isConnected)return;
      const rect=card.getBoundingClientRect();
      let localX=x-rect.left, localY=y-rect.top;
      // 大型分场剧本卡将坐标投到最近边缘，沿用参考的局部边框可见方式。
      const glowHeight = rect.height;
      if(card.matches('.script-scene-card')) {
        localX = Math.max(0, Math.min(rect.width, localX));
        localY = Math.max(0, Math.min(glowHeight, localY));
        const distances=[localX,rect.width-localX,localY,glowHeight-localY];
        const edge=distances.indexOf(Math.min(...distances));
        if(edge===0)localX=0;
        else if(edge===1)localX=rect.width;
        else if(edge===2)localY=0;
        else localY=glowHeight;
      }
      card.style.setProperty('--glow-x',`${localX}px`);
      card.style.setProperty('--glow-y',`${localY}px`);
    });
  },{passive:true});
})();
