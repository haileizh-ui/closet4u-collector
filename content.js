(() => {
  const platform=location.hostname;
  const host = document.createElement('div');
  host.id = 'closet-collector';
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `<style>
  :host{all:initial} .tools{position:fixed;z-index:2147483646;display:none;gap:6px;flex-direction:column;align-items:flex-end}
  button{font:500 13px/1.4 system-ui;color:white;background:rgba(38,38,33,.82);backdrop-filter:blur(12px);border:1px solid #ffffff55;border-radius:24px;padding:10px 16px;cursor:pointer;box-shadow:0 2px 12px #0002}button:hover,button:focus-visible{background:#222;outline:2px solid #d8e9a8;outline-offset:2px}button:disabled{opacity:.65;cursor:wait}
  .status{position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:360px;max-height:45vh;overflow:auto;background:#242822;color:#fff;padding:14px 20px;border-radius:14px;font:14px/1.6 system-ui;display:none}
  </style><div class="tools"><button data-mode="video">▷ 采集视频到Closet</button><button data-mode="all">▧ 采集全部图片</button><button data-mode="single">＋ 采集到Closet</button></div><div class="status" role="status" aria-live="polite"></div>`;
  document.documentElement.append(host);
  const tools = root.querySelector('.tools'), status = root.querySelector('.status');
  let statusDismissed=false;
  function dismissStatus(){statusDismissed=true;status.style.display='none';}
  status.tabIndex=0;status.title='点击收起，或按 Escape 关闭；网站链接可正常打开';
  status.style.cursor='pointer';
  status.addEventListener('click',event=>{if(event.target.closest('a,details,summary,button'))return;event.stopPropagation();dismissStatus()});
  status.addEventListener('keydown',event=>{if(event.key==='Escape'||(event.target===status&&['Enter',' '].includes(event.key))){event.preventDefault();event.stopPropagation();dismissStatus()}});
  let image, busy = false, hideTimer;
  function position() {
    if (!image?.isConnected) { tools.style.display = 'none'; return; }
    const r = image.getBoundingClientRect();
    tools.style.left = Math.max(8, Math.min(innerWidth - 180, r.right - 180)) + 'px';
    tools.style.top = Math.max(8, Math.min(innerHeight - 110, r.bottom - 110)) + 'px';
  }
  document.addEventListener('pointerover', e => {
    if (e.composedPath().includes(host)) { clearTimeout(hideTimer); return; }
    let target = e.target;
    if(platform==='www.douyin.com'&&!(target instanceof HTMLVideoElement)){
      target=[...document.querySelectorAll('video')].find(v=>{const r=v.getBoundingClientRect();return r.width>180&&r.height>180&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom});
    }
    const isVideo = target instanceof HTMLVideoElement;
    if (!(target instanceof HTMLImageElement || isVideo)) return;
    if(['www.xiaohongshu.com','www.rednote.com'].includes(platform)&&!target.closest('.note-detail-mask, .note-container, .media-container, .swiper, .note-slider'))return;
    if(platform==='mp.weixin.qq.com'){
      let articleCdn=false;
      try{articleCdn=['mmbiz.qpic.cn','mmecoa.qpic.cn','mmbiz.qlogo.cn'].includes(new URL(target.getAttribute('data-src')||target.currentSrc||target.src,location.href).hostname)}catch{}
      if(isVideo||(!target.closest('#js_content,#js_image_container,.js_image_pages')&&!articleCdn))return;
    }
    if(platform==='www.douyin.com'&&!isVideo)return;
    const r = target.getBoundingClientRect();
    if (r.width < (platform==='mp.weixin.qq.com'?80:180) || r.height < (platform==='mp.weixin.qq.com'?60:180) || (['www.xiaohongshu.com','www.rednote.com'].includes(platform)&&!isVideo&&!/(?:xhscdn\.(?:com|net)|rednotecdn\.com)/.test(target.src))) return;
    root.querySelectorAll('button').forEach(b => { b.hidden = (b.dataset.mode === 'video') !== isVideo; });
    if(image&&image!==target)image.removeAttribute('data-closet-current');
    target.setAttribute('data-closet-current','1');
    clearTimeout(hideTimer); image = target; tools.style.display = 'flex'; position();
  });
  document.addEventListener('pointerout', e => {
    if (e.target === image || e.composedPath().includes(host)) hideTimer = setTimeout(() => { if (!root.activeElement) tools.style.display = 'none'; }, 500);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') {tools.style.display = 'none';dismissStatus();} });
  addEventListener('scroll', position, true); addEventListener('resize', position);
  let website='https://danime.dawoai.com/closet';
  function siteLink(container,login=false,url=website){
    try{const u=new URL(!login&&url.replace(/\/$/,'')==='https://closet.cuddlycuddle.com'?'https://danime.dawoai.com/closet':url);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return;
      const link=document.createElement('a');link.href=u.href.replace(/\/$/,'')+(login?'/wardrobe':'/updates');link.target='_blank';link.rel='noopener noreferrer';
      link.textContent=(login?'登录 Closet4U 后重试':'Closet4U · 探索')+' · '+u.host;
      link.style.cssText='display:block;color:#d8e9a8;margin-top:8px;text-decoration:underline';container.append(link);
    }catch{}
  }
  chrome.runtime.sendMessage({type:'website'}).then(r=>{if(r?.ok&&r.data?.url)website=r.data.url}).catch(()=>{});
  function say(text,login=false) { statusDismissed=false;status.textContent = text;siteLink(status,login); status.style.display = 'block'; }
  const phaseText={queued:'已提交',collecting:'排队/采集中',publishing:'发布中',waiting_login:'等待重新登录',completed:'已完成',failed:'未完成'};
  let taskRows=[],historyOpen=false;
  function renderTasks(){
    status.replaceChildren();
    if(!taskRows.length){status.style.display='none';return;}
    const header=document.createElement('b');
    header.textContent='采集任务 · '+taskRows.filter(j=>!['completed','failed'].includes(j.phase)).length+' 个进行中';
    status.append(header);
    CollectionHistoryUI.render(status,taskRows,task=>{
      const row=document.createElement('div');row.style.cssText='margin-top:10px;border-top:1px solid #ffffff25;padding-top:8px';
      const title=document.createElement('div');title.textContent=task.title+' · '+(phaseText[task.phase]||task.phase);
      const detail=document.createElement('small');detail.textContent=task.error||task.message||'';
      row.append(title,detail);
      if(task.phase==='waiting_login'){const hint=document.createElement('div');hint.textContent='请在网站登录提交任务的原账号，保持网站页面打开，扩展会自动恢复查询。';row.append(hint);siteLink(row,true,task.server||website)}
      else if(task.phase==='failed'){const hint=document.createElement('div');hint.textContent='可先登录 Closet4U，保持网站页面打开后返回重试。';row.append(hint);siteLink(row,true,task.server||website)}
      return row;
    },{open:historyOpen,onToggle:open=>{historyOpen=open}});
    siteLink(status);
    status.style.display=statusDismissed?'none':'block';
  }
  async function refreshTasks(){
    try{const result=await chrome.runtime.sendMessage({type:'tasks'});if(result.ok&&Array.isArray(result.data)){taskRows=CollectionHistoryUI.ordered(result.data);renderTasks()}}catch{}
  }
  chrome.runtime.onMessage.addListener(message=>{
    if(message.type!=='collection:state')return;
    const index=taskRows.findIndex(j=>j.id===message.job.id);
    if(index<0)taskRows.unshift(message.job);else taskRows[index]=message.job;
    taskRows=CollectionHistoryUI.ordered(taskRows);
    renderTasks();
  });
  refreshTasks();
  root.querySelectorAll('button').forEach(button => button.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation(); if (busy) return;
    busy = true; root.querySelectorAll('button').forEach(b => b.disabled = true);
    say(button.dataset.mode === 'video' ? '正在采集视频笔记，下载与处理可能需要几分钟…' : '正在采集笔记和图片…');
    try {
      let response = await chrome.runtime.sendMessage({type: 'collect', mode: button.dataset.mode, image: image.getAttribute('data-src') || image.currentSrc || image.src});
      if (!response.ok) {const error=new Error(response.error);error.status=response.status;throw error;}
      say('任务已提交，可继续采集其他笔记。完成后会通知你。');
      await refreshTasks();
    } catch (error) { const login=[401,403].includes(error.status)||/登录|凭据|连接账号/.test(error.message);say('采集未完成：' + error.message + (login?'。请登录 Closet4U，保持网站页面打开，再返回此页重试。':'。可先登录 Closet4U 后重试；若仍失败，请按上述原因处理。'),true); }
    finally { busy = false; root.querySelectorAll('button').forEach(b => b.disabled = false); }
  }));
})();
