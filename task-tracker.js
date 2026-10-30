/* Persistent task monitoring belongs to the worker, never to the source tab. */
const CollectionTasks=(()=>{
  const KEY='collectionJobs',ALARM='closet-collection-poll';
  const terminal=j=>['completed','failed'].includes(j.phase);
  let loaded,persist=Promise.resolve(),polling=false,timer;
  async function jobs(){
    await storageReady;
    if(!loaded)loaded=chrome.storage.local.get(KEY).then(s=>Array.isArray(s[KEY])?s[KEY]:[]);
    return loaded;
  }
  const summary=j=>({id:j.id,title:j.title,phase:j.phase,error:j.error||'',message:j.message||'',server:j.server,createdAt:j.createdAt,updatedAt:j.updatedAt});
  async function save(){
    persist=persist.catch(()=>{}).then(async()=>{
      const rows=await jobs();
      await chrome.storage.local.set({[KEY]:rows.map(j=>({...j}))});
    });
    return persist;
  }
  async function badge(){
    const n=(await jobs()).filter(j=>!terminal(j)).length;
    await chrome.action.setBadgeText({text:n?String(n):''});
    await chrome.action.setBadgeBackgroundColor({color:'#245d49'});
  }
  async function broadcast(job){
    if(Number.isInteger(job.tabId))await chrome.tabs.sendMessage(job.tabId,{type:'collection:state',job:summary(job)}).catch(()=>{});
  }
  async function notify(job){
    if(job.notified)return;
    try{
      await chrome.notifications.create('closet-collect-'+job.id,{type:'basic',iconUrl:chrome.runtime.getURL('icons/icon-128.png'),
        title:job.phase==='failed'?'Closet4U 采集未完成':'Closet4U 采集完成',
        message:(job.title+'\n'+(job.error||job.message)).slice(0,220)+'\n'+(job.phase==='failed'?'登录网站后重试：':'点击查看：')+job.server});
    }catch(error){job.notificationError=String(error.message||error)}
    job.notified=true;await save();
  }
  async function schedule(){
    clearTimeout(timer);
    const rows=(await jobs()).filter(j=>!terminal(j));
    if(!rows.length){await chrome.alarms.clear(ALARM);return;}
    if(!await chrome.alarms.get(ALARM))await chrome.alarms.create(ALARM,{periodInMinutes:.5});
    if(rows.some(j=>j.phase!=='waiting_login'))timer=setTimeout(()=>pump().catch(()=>{}),3000);
  }
  async function pollOne(job){
    job.lastPolledAt=Date.now();
    try{
      const result=await request('jobs/'+encodeURIComponent(job.jobId),undefined,job);
      job.error='';
      if(result.status==='failed'){
        job.phase='failed';job.error=result.error||'采集失败，请重试';
      }else if(result.status==='completed'){
        if(result.result?.original_publish_error){job.phase='failed';job.error='素材已采集，发布未完成：'+result.result.original_publish_error}
        else{job.phase='completed';job.message=result.result?.reused?'已复用现有素材，并加入你的列表':'素材已采集并发布'}
      }else{
        job.phase=result.status==='publishing'?'publishing':'collecting';
        job.message=job.phase==='publishing'?'素材已采集，正在发布':'正在排队或采集媒体';
      }
    }catch(error){
      if([401,403].includes(error.status)){job.phase='waiting_login';job.error=error.message+'。请在 Closet4U 网站登录原账号，保持页面打开，扩展将自动恢复查询。'}
      else if(error.status===404||Date.now()-job.createdAt>24*3600*1000){job.phase='failed';job.error=error.message||'任务状态已过期，请重新采集'}
      else{job.error='同步暂时中断，将自动重试：'+error.message}
    }
    job.updatedAt=Date.now();
    await save();await broadcast(job);
    if(terminal(job)){
      await notify(job);
      await notifyConsumers().catch(()=>{});
    }
  }
  async function pump(){
    if(polling)return;
    polling=true;
    try{
      const rows=await jobs();
      // Bound simultaneous status requests; older unchecked tasks go first.
      const pending=rows.filter(j=>!terminal(j)).sort((a,b)=>(a.lastPolledAt||0)-(b.lastPolledAt||0)).slice(0,4);
      await Promise.allSettled(pending.map(pollOne));
      for(const job of rows.filter(j=>terminal(j)&&!j.notified))await notify(job);
      await badge();
    }finally{polling=false;await schedule()}
  }
  async function track(result,note,tabId){
    const config=await chrome.storage.local.get(['server','user']);
    if(!config.server||!config.user?.id)throw new Error('任务已提交，请重新连接账号以恢复状态查询');
    const rows=await jobs();
    const existing=rows.find(j=>!terminal(j)&&j.server===config.server&&j.ownerId===config.user.id&&j.materialId&&j.materialId===result.material_id);
    const job=existing||{id:crypto.randomUUID(),server:config.server,ownerId:config.user.id,
      materialId:result.material_id,title:String(note.title||note.text||'未命名笔记').slice(0,150),phase:'queued',createdAt:Date.now()};
    Object.assign(job,{jobId:result.job_id,tabId,updatedAt:Date.now(),error:'',message:'已提交，可继续采集其他笔记'});
    if(!existing)rows.push(job);
    await save();await badge();await broadcast(job);await schedule();
    clearTimeout(timer);timer=setTimeout(()=>pump().catch(()=>{}),100);
    return job.id;
  }
  async function list(){
    const config=await chrome.storage.local.get(['server','user']);
    return (await jobs()).filter(j=>j.server===config.server&&j.ownerId===config.user?.id)
      .sort((a,b)=>b.createdAt-a.createdAt).map(summary);
  }
  chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)return pump()});
  chrome.runtime.onStartup.addListener(()=>pump().catch(()=>{}));
  chrome.runtime.onInstalled.addListener(()=>pump().catch(()=>{}));
  chrome.notifications.onClicked.addListener(async id=>{
    const job=(await jobs()).find(j=>'closet-collect-'+j.id===id);
    if(job)await chrome.tabs.create({url:job.server+'/updates'});
  });
  pump().catch(()=>{});
  return {track,list,pump};
})();
