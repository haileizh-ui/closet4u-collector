const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  let listener;
  const stored = {server:'https://danime.dawoai.com/closet'};
  const calls=[];
  const video = {title:'视频标题',desc:'视频正文',type:'video',user:{userId:'b'.repeat(24),nickname:'博主',avatar:'//sns-avatar-qc.xhscdn.com/avatar/one'},video:{media:{stream:{h264:[{masterUrl:'https://sns-video.xhscdn.com/stream.mp4'}]}}}};
  const context = vm.createContext({URL,URLSearchParams,AbortSignal,Date,console,setTimeout:()=>1,clearTimeout:()=>{},crypto:require('node:crypto'),
    location:{pathname:'/explore/'+'a'.repeat(24),search:''},
    CustomEvent:class CustomEvent{},
    window:{dispatchEvent:()=>true,__INITIAL_STATE__:{note:{noteDetailMap:{['a'.repeat(24)]:{note:video}}}}},
    fetch:async (url,options)=>{
      calls.push({url,options});
      const data=url.endsWith('/token') ? {token:'scoped-user-token',expires_at:Date.now()/1000+900,user:{id:'one',nickname:'用户'}} : url.endsWith('/collect') ? {job_id:'owner-bound-ticket'} : {ok:true};
      return {ok:true,status:200,json:async()=>data};
    },
    chrome:{storage:{local:{setAccessLevel:async()=>{},get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,stored[k]])),set:async value=>Object.assign(stored,value),remove:async keys=>keys.forEach(k=>delete stored[k])}},
      permissions:{contains:async()=>true},tabs:{query:async()=>[{id:2,url:'https://danime.dawoai.com/closet/wardrobe'}],create:async()=>{},sendMessage:async()=>{}},
      action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},alarms:{get:async()=>undefined,create:async()=>{},clear:async()=>{},onAlarm:{addListener:()=>{}}},notifications:{create:async()=>{},onClicked:{addListener:()=>{}}},
      scripting:{executeScript:async opts=>[{result:opts.files?{platform:"douyin",note_id:"7628540743641138267",source_url:"https://www.douyin.com/video/7628540743641138267",author:{userId:"MS4wLjABfeed",nickname:"推荐博主"},title:"推荐正文",text:"推荐正文",video_urls:[],images:[]}:await opts.func(...(opts.args||[]))}]},
      runtime:{getURL:p=>'chrome-extension://test/'+p,onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:fn=>listener=fn}}}
  });
  context.importScripts=file=>vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/background.js','utf8'),context);
  const send=(message,sender={})=>new Promise(resolve=>listener(message,sender,resolve));
  const result=await send({type:'auto-connect'});
  assert.equal(result.ok,true);assert.equal(stored.token,'scoped-user-token');assert.equal(stored.authVersion,2);
  const sender={tab:{id:1,url:'https://www.xiaohongshu.com/explore/'+'a'.repeat(24)}};
  const collected=await send({type:'collect',mode:'video'},sender);
  assert.equal(collected.ok,true);
  const call=calls.find(c=>c.url.endsWith('/collect'));
  assert.equal(call.url,'https://danime.dawoai.com/closet/api/closet-extension/collect');
  assert.equal(call.options.headers.Authorization,'Bearer scoped-user-token');
  const body=JSON.parse(call.options.body);assert.equal(body.author.avatar,'//sns-avatar-qc.xhscdn.com/avatar/one');assert.equal(body.mode,'video');assert.equal(body.title,'视频标题');assert.equal(body.images.length,0);assert(body.video_stream.h264.length);
  assert.equal((await send({type:'collect',mode:'video'},{tab:{id:9,url:'https://untrusted.example'}})).ok,false);
  assert.equal((await send({type:'collect',mode:'single'},sender)).ok,false);
  const polled=await send({type:'status',jobId:'signed.owner-ticket'},sender);assert.equal(polled.ok,true);
  assert(calls.some(c=>c.url.endsWith('/jobs/signed.owner-ticket')));
  const feedResult=await send({type:'collect',mode:'video'},{tab:{id:3,url:'https://www.douyin.com/?recommend=1'}});assert.equal(feedResult.ok,true);
  const feedBody=JSON.parse(calls.filter(c=>c.url.endsWith('/collect')).at(-1).options.body);assert.equal(feedBody.note_id,'7628540743641138267');assert.equal(feedBody.source_url,'https://www.douyin.com/video/7628540743641138267');assert.equal(feedBody.mode,'video');assert.equal(feedBody.author.nickname,'推荐博主');assert.deepEqual(feedBody.video_urls,[]);
  console.log('PASS: session bootstrap, prefixed consumer relay, video metadata, untrusted sender rejection, owner ticket polling');
})().catch(error=>{console.error(error);process.exit(1)});
