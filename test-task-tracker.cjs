const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const code=fs.readFileSync(__dirname+'/task-tracker.js','utf8');
const clone=o=>JSON.parse(JSON.stringify(o));
const stored={server:'https://consumer.example/closet',user:{id:'alice'}};
const responses=new Map(),notifications=[],messages=[],alarms=new Map(),badges=[];
function worker(){
 const context=vm.createContext({Promise,Date,console,crypto,setTimeout:()=>1,clearTimeout:()=>{},storageReady:Promise.resolve(),
  request:async(path,body,expected)=>{
   if(expected.ownerId!==stored.user.id||expected.server!==stored.server){const e=Error('切回原账号');e.status=401;throw e}
   const value=responses.get(decodeURIComponent(path.split('/').at(-1)))||{status:'collecting'};
   if(value instanceof Error)throw value;
   return clone(value);
  },notifyConsumers:async()=>{},
  chrome:{storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,stored[k]===undefined?undefined:clone(stored[k])])),set:async values=>Object.assign(stored,clone(values))}},
   action:{setBadgeText:async v=>badges.push(v.text),setBadgeBackgroundColor:async()=>{}},
   tabs:{sendMessage:async(id,value)=>messages.push(clone(value)),create:async()=>{}},
   alarms:{get:async n=>alarms.get(n),create:async(n,v)=>alarms.set(n,v),clear:async n=>alarms.delete(n),onAlarm:{addListener:()=>{}}},
   runtime:{getURL:p=>'chrome-extension://test/'+p,onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}}},
   notifications:{create:async(id,value)=>notifications.push({id,...value}),onClicked:{addListener:()=>{}}}}
 });
 vm.runInContext(code,context);
 return context;
}
const settle=()=>new Promise(setImmediate);
(async()=>{
 let context=worker();await settle();
 const track=(job,material,title)=>vm.runInContext(`CollectionTasks.track({job_id:${JSON.stringify(job)},material_id:${JSON.stringify(material)}},{title:${JSON.stringify(title)}},1)`,context);
 const idA=await track('signed-A','material-A','第一篇');
 const idB=await track('signed-B','material-B','第二篇');
 assert.notEqual(idA,idB);assert.equal(stored.collectionJobs.length,2);assert.equal(badges.at(-1),'2');
 assert.equal(await track('signed-A2','material-A','重复点击'),idA);assert.equal(stored.collectionJobs.length,2);
 responses.set('signed-A2',{status:'publishing'});responses.set('signed-B',{status:'collecting'});
 await vm.runInContext('CollectionTasks.pump()',context);
 assert.equal(stored.collectionJobs.find(j=>j.id===idA).phase,'publishing');assert.equal(notifications.length,0);
 stored.user={id:'bob'};await vm.runInContext('CollectionTasks.pump()',context);
 assert(stored.collectionJobs.every(j=>j.phase==='waiting_login'));assert.equal(notifications.length,0);
 stored.user={id:'alice'};
 responses.set('signed-A2',Error('network temporarily offline'));
 await vm.runInContext('CollectionTasks.pump()',context);
 assert(stored.collectionJobs.find(j=>j.id===idA).error.includes('自动重试'));assert.equal(notifications.length,0);
 responses.set('signed-A2',{status:'completed',result:{success:true}});responses.set('signed-B',{status:'failed',error:'下载失败'});
 await vm.runInContext('CollectionTasks.pump()',context);
 assert.equal(notifications.length,2);assert(notifications.some(n=>n.title.includes('完成')&&n.message.includes('第一篇')));
 assert(notifications.some(n=>n.message.includes('下载失败')));assert.equal(badges.at(-1),'');
 await vm.runInContext('CollectionTasks.pump()',context);assert.equal(notifications.length,2);
 context=worker();await settle();await vm.runInContext('CollectionTasks.pump()',context);assert.equal(notifications.length,2);
 await track('signed-C','material-C','关闭页面后的任务');
 alarms.clear();responses.set('signed-C',{status:'completed',result:{success:true,reused:true}});
 context=worker();await settle();await vm.runInContext('CollectionTasks.pump()',context);
 assert.equal(notifications.length,3);assert(notifications.at(-1).message.includes('已复用'));
 assert(stored.collectionJobs.every(j=>['completed','failed'].includes(j.phase)&&j.notified));
 assert(messages.some(m=>m.job.phase==='completed'));assert(messages.some(m=>m.job.phase==='failed'));
 console.log('PASS: simultaneous queued jobs, duplicate submission coalescing, publishing state, account isolation, network retries, completion/failure notices exactly once, worker restart recovery');
})().catch(e=>{console.error(e);process.exit(1)});
