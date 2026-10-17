/* 2026-09-22：短剧第一步独立 Agent。提示词、意图判断、分页卡及状态均不依赖全能创作；
 * 仅通过主应用桥接读取短剧上下文和启动已有预置大纲流程。 */
(() => {
  const prompt = `你是专业短剧编剧助手，围绕故事主线、人物动机、冲突、反转、分集节奏和结尾悬念帮助创作。只使用当前短剧上下文。
只有用户明确说“确认生成”“直接生成”“开始生成”“生成大纲”等执行指令时才允许生成。仅提供“穿越”等题材、故事描述、补充设定或泛泛说想写剧本，都必须先询问补充信息，禁止自行推断用户已确认。没有明确确认时 action 必须为 chat，不能声称正在生成或将立即生成。
信息不足且用户未要求直接生成时，一次列出所有必要问题，使用 confirmation_batch，不要长篇追问，也不要重复询问已确定的设定。凡回复中要求用户回答、选择、确认或补充信息，必须同时返回非空 questions 数组；禁止只返回“请回答以下问题”等引导文案。问题应贴合用户题材，涵盖必要的主角、核心冲突和剧情方向，不固定套用无关题目。
只输出 JSON：普通回复 {"action":"chat","reply":"简洁中文回复"}；生成 {"action":"generate_outline","reply":"正在为你生成剧本大纲。"}；修改 {"action":"revise_outline","reply":"正在调整剧本。"}；补充信息 {"kind":"confirmation_batch","intro":"一句简短说明","questions":[{"id":"hero","title":"问题","type":"text|single|multiple","placeholder":"具体输入提示","maxSelections":3,"options":[{"label":"选项","description":"简短说明"}]}]}。
单选和多选的第一个选项为推荐项。所有待确认问题放在同一个 questions 数组。用户完成整批选择后直接生成，不得继续追问。不要声称已经完成右侧内容。`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function wantsGeneration(text) {
    // 2026-09-22：生成权限由用户本轮明确执行指令决定，题材词和泛泛创作意愿不授权模型生成。
    const value = String(text || '').trim();
    if (/(不要|不用|不必|先别|别急|暂不|暂时不|还不|不想|不能|如何|怎么|怎样|是否|能否|可不可以|可以吗|能不能|[？?])/.test(value)) return false;
    return /(?:确认|直接|立即|马上|开始|现在|可以开始|请|帮我|给我)\s*生成|按.{0,16}生成|^(?:生成(?:剧本|大纲|短剧|故事)?(?:大纲)?[吧。！!]?|确认[。！!]?|开始吧|可以开始)$/.test(value);
  }

  // 2026-09-22：统一模型的嵌套问题、字段别名和字符串选项，避免有问题数据却未挂载卡片。
  function normalizeBatch(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return {action:'chat',reply:String(result || '')};
    let source = result;
    for (const candidate of [result.confirmation_batch, result.data, result.reply, result.content]) {
      let nested = candidate;
      if (typeof nested === 'string') { try { nested = JSON.parse(nested); } catch {} }
      if (nested && typeof nested === 'object' && Array.isArray(nested.questions)) { source = nested; break; }
    }
    const questions = (Array.isArray(source.questions) ? source.questions : []).map((q, i) => {
      if (typeof q === 'string') q = {title:q,type:'text'};
      if (!q || typeof q !== 'object') return null;
      const title = String(q.title || q.question || q.label || '').trim();
      if (!title) return null;
      const options = (Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : []).map(o => typeof o === 'string' ? {label:o} : {label:String(o?.label || o?.title || o?.value || ''),description:String(o?.description || o?.subtitle || '')}).filter(o => o.label.trim());
      return {...q,id:q.id || 'question-'+i,title,options,type:!options.length || q.type==='text' ? 'text' : ['multiple','multi'].includes(q.type) ? 'multiple' : 'single'};
    }).filter(Boolean);
    return questions.length ? {...result,kind:'confirmation_batch',intro:String(source.intro || result.intro || (typeof result.reply==='string' && !result.reply.trim().startsWith('{') ? result.reply : '') || '请补充以下关键设定：'),questions} : {...result,questions:[]};
  }
  // 2026-09-22：澄清回复缺少有效问题时提供可操作的本地卡片；穿越题材有专属方向，其他题材使用通用编剧问题。
  function fallbackBatch(text) {
    const timeTravel = /穿越|穿书|穿到/.test(text);
    const labels = timeTravel ? ['现代人穿越古代','古代人来到现代','穿进小说世界','平行时空穿越'] : ['逆袭成长','悬疑探秘','情感羁绊','复仇反转'];
    return {kind:'confirmation_batch',action:'chat',intro:'先确认几个关键设定，你可以选择推荐项或填写自己的想法。',questions:[
      {id:'direction',title:timeTravel?'希望故事采用哪种穿越方向？':'希望故事重点发展哪个方向？',type:'single',options:labels.map(label=>({label}))},
      {id:'hero',title:'主角是什么身份，最想实现什么目标？',type:'text',placeholder:'描述主角身份、处境和目标，也可以留空交给我构思',options:[]},
      {id:'tone',title:'希望剧情带来哪些感受？',type:'multiple',maxSelections:2,options:[{label:'爽感逆袭',description:'成长突破、绝境翻盘'},{label:'悬念反转',description:'层层揭密、意外转折'},{label:'情感共鸣',description:'关系变化、人物成长'},{label:'轻松喜剧',description:'幽默碰撞、轻快节奏'}]}
    ]};
  }

  // 2026-09-30 改动逻辑：质检优化是已有步骤的明确操作，只让 Agent 根据当前正文回复具体优化方案；不触发创作澄清卡和预置正文重新生成。
  async function request({text, session, context, stage, optimization = false, images = [], key, model}) {
    // 2026-10-01：短剧图片随本轮文本以多模态消息传入真实请求；纯文字保留原格式，澄清兜底只提取文本。
    const imageParts = images.filter(image => image?.url).map(image => ({type:'image_url',image_url:{url:image.url}}));
    session.messages.push({role:'user', content:imageParts.length ? [{type:'text',text}, ...imageParts] : text});
    let result;
    const confirmed = wantsGeneration(text);
    if (confirmed && !imageParts.length) result={action:stage==='empty'?'generate_outline':'revise_outline',reply:'好的，我将为你生成剧本大纲。'};
    else {
      const response=await fetch('https://api.minimaxi.com/v1/chat/completions', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model,messages:[{role:'system',content:prompt+(optimization ? '\n本轮用户已确认对当前步骤进行逻辑优化。只输出 action 为 chat 的 JSON 和 reply：基于当前正文给出具体的因果、人物动机及衔接优化建议，不再询问题材或设定，不声称已修改右侧内容。' : '')+'\n当前阶段：'+stage+'\n'+context},...session.messages.slice(-20)],temperature:0.35,stream:false,thinking:{type:'disabled'}}),signal:AbortSignal.timeout(90000)});
      if(!response.ok) throw new Error('短剧回复暂不可用');
      const data=await response.json();
      const raw=String(data.choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim().replace(/^```(?:json)?\s*|\s*```$/g,'');
      try { result=JSON.parse(raw); } catch { result={action:'chat',reply:raw}; }
    }
    // 2026-09-22：先规范化再判断是否需要兜底，保留有效的模型问题，不让空数组或纯引导文案造成无卡片。
    result = normalizeBatch(result);
    const replyText = String(result.reply || result.intro || '');
    const requestsDetails = /确认|补充|请.{0,8}回答|以下问题|几个.{0,6}问题|关键.{0,6}(设定|信息|方向)|选择|你希望|你想|偏向|偏好/.test(replyText);
    const briefIdea = !session.firstTurnComplete && text.trim().length <= 30 && !/[？?]|是什么|怎么|如何|为什么|谢谢|你好|暂停|取消|不要/.test(text);
    const unauthorizedGeneration = ['generate_outline','revise_outline'].includes(result.action) || /(?:正在|将|马上|立即).{0,16}生成/.test(replyText);
    if (optimization) result = {action:'chat',reply:replyText || '我会围绕人物动机、事件因果和剧情衔接给出逻辑优化建议。'};
    if (!confirmed && unauthorizedGeneration) result.action = 'chat';
    if (!optimization && !confirmed && !result.questions.length && (requestsDetails || briefIdea || unauthorizedGeneration || result.kind === 'confirmation_batch')) {
      result = fallbackBatch(session.messages.filter(m=>m.role==='user').map(m=>Array.isArray(m.content) ? m.content.filter(part=>part.type==='text').map(part=>part.text).join('\n') : m.content).join('\n'));
    }
    // 2026-09-22：本地识别和模型返回的生成动作统一使用承接式回复，不再输出追问或重复设定。
    if (result.action === 'generate_outline' || result.action === 'revise_outline') {
      result.reply = '好的，我将为你生成剧本大纲。';
      delete result.questions;
    }
    session.firstTurnComplete=true;
    session.messages.push({role:'assistant',content:JSON.stringify(result)});
    if(Array.isArray(result.questions)&&result.questions.length) return {action:'chat',reply:JSON.stringify(result)};
    return {action:['generate_outline','revise_outline'].includes(result.action)?result.action:'chat',reply:String(result.reply||'我们可以继续梳理人物、冲突和剧情方向。')};
  }
  function render(host, raw) {
    let batch; try { batch=JSON.parse(raw); } catch { return; }
    // 2026-09-22：展示层与请求层使用同一规范化规则，兼容恢复的历史消息。
    batch = normalizeBatch(batch);
    if(!host || !Array.isArray(batch.questions)||!batch.questions.length)return;
    const questions=batch.questions.filter(q=>q&&q.title).map(q=>({...q,type:q.type==='multiple'?'multiple':q.type==='text'||!q.options?.length?'text':'single',options:(q.options||[]).map(o=>typeof o==='string'?{label:o}:o).filter(o=>o?.label)}));
    if(!questions.length)return;
    host.textContent=batch.intro||'为了完善短剧方向，需要确认几个关键细节：';
    const card=document.createElement('section');card.className='drama-outline-card';
    card.dataset.state=JSON.stringify({questions,completionStage:batch.completionStage,index:0,answers:questions.map(q=>({selected:q.type!=='text'&&q.options[0]?[q.options[0].label]:[],custom:'',text:''}))});
    host.append(card);paint(card);
  }
  // 2026-09-30 Product Design：生成完成后复用短剧独立问题卡，按大纲/剧本阶段给出可执行的后续选项；不使用全能创作组件或状态。
  function completion(stage) {
    const isOutline = stage === 'overall';
    return JSON.stringify({kind:'confirmation_batch',completionStage:stage,
      intro:isOutline?'短剧大纲已生成完成。':'短剧剧本已生成完成。',
      questions:[{id:'next-action',title:'接下来你想做什么？',type:'single',options:isOutline?[
        {label:'直接生成分集剧本',action:'advance'},
        {label:'查看并调整短剧大纲',action:'outline'},
        {label:'修改某个角色/场景设定',action:'settings'},
        {label:'修改某集大纲内容',action:'episode-outline'}
      ]:[
        {label:'直接进入资产生成',action:'advance'},
        {label:'查看并调整某集分场剧本',action:'script'},
        {label:'修改某个角色/场景设定',action:'settings'},
        {label:'查看某集大纲内容',action:'episode-outline'}
      ]}]});
  }
  // 2026-09-30：只有多个问题才显示左右箭头和页码；完成后的单问题按钮使用“继续”，避免误提示重新生成。
  function paint(card) {
    const s=JSON.parse(card.dataset.state),q=s.questions[s.index],a=s.answers[s.index];
    card.innerHTML=`<div class="do-head"><strong>${escape(q.title)}</strong>${s.questions.length>1?`<div class="do-nav"><button type="button" data-do="prev" aria-label="上一个问题" ${s.index?'':'disabled'}>←</button><span>${s.index+1}/${s.questions.length}</span><button type="button" data-do="next" aria-label="下一个问题" ${s.index===s.questions.length-1?'disabled':''}>→</button></div>`:''}</div><div class="do-body">${q.type==='text'?`<textarea data-do-text placeholder="${escape(q.placeholder||'请输入你的想法')}">${escape(a.text)}</textarea>`:q.options.map((o,i)=>`<button type="button" class="do-option ${a.selected.includes(o.label)?'selected':''}" data-do-option="${i}" aria-pressed="${a.selected.includes(o.label)}"><span class="do-marker">${q.type==='multiple'?(a.selected.includes(o.label)?'✓':''):i+1}</span><span><b>${escape(o.label)}</b>${o.description?`<small>${escape(o.description)}</small>`:''}</span></button>`).join('')+`<div class="do-custom"><input data-do-custom placeholder="输入其他选项" value="${escape(a.custom)}"><button type="button" data-do="clear" aria-label="清空其他选项" ${a.custom?'':'disabled'}>×</button></div>`}</div><div class="do-actions"><button type="button" data-do="continue">${s.completionStage?'继续':s.index===s.questions.length-1?'确认并生成':'继续'}</button></div>`;
  }
  // 事件委托与序列化状态支持原应用切换步骤时恢复对话 HTML，翻页仍能保留所有答案。
  document.addEventListener('click',e=>{
    const card=e.target.closest('.drama-outline-card');if(!card||card.dataset.done)return;
    const s=JSON.parse(card.dataset.state),q=s.questions[s.index],a=s.answers[s.index];
    const option=e.target.closest('[data-do-option]'),action=e.target.closest('[data-do]')?.dataset.do;
    if(!option&&!action)return;e.preventDefault();
    if(option){const label=q.options[Number(option.dataset.doOption)].label;if(q.type==='single'){a.selected=[label];a.custom='';}else if(a.selected.includes(label))a.selected=a.selected.filter(x=>x!==label);else if(a.selected.length+(a.custom.trim()?1:0)<(Number(q.maxSelections)||q.options.length))a.selected.push(label);}
    if(action==='clear')a.custom='';
    if(action==='prev')s.index=Math.max(0,s.index-1);
    if(action==='next')s.index=Math.min(s.questions.length-1,s.index+1);
    if(action==='continue'){
      if(s.index<s.questions.length-1)s.index++;
      else {card.dataset.done='true';card.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);e.target.textContent='已确认';
        // 2026-09-30：完成卡提交专属后续操作事件，选项不再拼成生成大纲指令；自定义想法交给原短剧发送入口。
        if(s.completionStage){
          const chosen=q.options.find(o=>o.label===a.selected[0]);
          const accepted=window.dispatchEvent(new CustomEvent('drama-completion-submit',{cancelable:true,detail:{stage:s.completionStage,action:a.custom.trim()?'custom':chosen?.action,text:a.custom.trim()||chosen?.label}}));
          if(!accepted){delete card.dataset.done;paint(card);}
          return;
        }
        const summary='我已一次性确认全部信息，请直接生成剧本大纲：\n'+s.questions.map((question,i)=>question.title+'：'+([s.answers[i].text,...s.answers[i].selected,s.answers[i].custom].filter(Boolean).join('、')||'未补充')).join('\n');
        window.dispatchEvent(new CustomEvent('drama-outline-submit',{detail:summary}));return;}
    }
    card.dataset.state=JSON.stringify(s);paint(card);
  });
  document.addEventListener('input',e=>{
    const card=e.target.closest('.drama-outline-card');if(!card||card.dataset.done)return;
    const s=JSON.parse(card.dataset.state),a=s.answers[s.index],q=s.questions[s.index];
    if(e.target.matches('[data-do-text]'))a.text=e.target.value;
    if(e.target.matches('[data-do-custom]')){a.custom=e.target.value;if(a.custom.trim()){if(q.type==='single')a.selected=[];else a.selected=a.selected.slice(0,Math.max(0,(Number(q.maxSelections)||q.options.length)-1));}card.querySelectorAll('[data-do-option]').forEach(b=>{const selected=a.selected.includes(q.options[Number(b.dataset.doOption)].label);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));if(q.type==='multiple')b.querySelector('.do-marker').textContent=selected?'✓':'';});card.querySelector('[data-do="clear"]').disabled=!a.custom;}
    card.dataset.state=JSON.stringify(s);
  });
  window.DramaOutlineAgent={request,render,wantsGeneration,completion};
})();
