const fs=require('fs'),path=require('path'),assert=require('assert');const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});try{
 const p=await b.newPage();
 await p.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<div id="js_content"><img data-src="https://mmbiz.qpic.cn/one" style="width:400px;height:300px"><img data-src="https://mmbiz.qpic.cn/two" style="width:400px;height:300px"></div>'}));
 await p.goto('https://mp.weixin.qq.com/s/article');
 await p.evaluate(()=>{
  const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'})};
  window.submitted=[];window.chrome={runtime:{onMessage:{addListener:fn=>window.deliverTaskUpdate=fn},sendMessage:async msg=>{
   if(msg.type==='tasks')return {ok:true,data:window.submitted};
   if(msg.type==='collect'){
    const n=window.submitted.length+1;window.submitted.push({id:'task-'+n,title:'笔记 '+n,phase:'collecting',createdAt:Date.now()+n,message:'后台正在采集'});
    return {ok:true,data:{job_id:'signed-'+n,tracking_id:'task-'+n}};
   }
  }}};
 });
 await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'history-ui.js'),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'content.js'),'utf8')});
 await p.locator('img').first().dispatchEvent('pointerover');await p.getByRole('button',{name:'采集全部图片'}).click();
 await p.waitForFunction(()=>window.submitted.length===1);assert(await p.getByRole('button',{name:'采集全部图片'}).isEnabled());
 await p.locator('img').nth(1).dispatchEvent('pointerover');await p.getByRole('button',{name:'采集全部图片'}).click();
 await p.waitForFunction(()=>window.submitted.length===2);assert(await p.getByRole('button',{name:'采集全部图片'}).isEnabled());
 let text=await p.getByRole('status').textContent();assert(text.includes('笔记 1')&&text.includes('笔记 2')&&text.includes('2 个进行中'));
 await p.evaluate(()=>window.deliverTaskUpdate({type:'collection:state',job:{...window.submitted.find(j=>j.id==='task-1'),phase:'completed',message:'素材已采集并发布'}}));
 await p.evaluate(()=>window.deliverTaskUpdate({type:'collection:state',job:{...window.submitted.find(j=>j.id==='task-2'),phase:'failed',error:'测试失败原因'}}));
 text=await p.getByRole('status').textContent();assert(text.includes('已完成')&&text.includes('测试失败原因')&&text.includes('0 个进行中'));
 await p.getByRole('status').locator('b').first().click();assert(await p.getByRole('status').isHidden());
 await p.evaluate(()=>window.deliverTaskUpdate({type:'collection:state',job:{...window.submitted[0],phase:'completed',message:'后台更新'}}));
 assert(await p.getByRole('status').isHidden());
 const site=p.getByRole('link',{name:/打开 Closet4U/,includeHidden:true}).last();assert((await site.getAttribute('href')).endsWith('/wardrobe'));assert.equal(await site.getAttribute('target'),'_blank');
 await p.evaluate(()=>{const send=window.chrome.runtime.sendMessage;window.chrome.runtime.sendMessage=async msg=>msg.type==='collect'?{ok:false,status:401,error:'登录凭据已失效'}:send(msg)});
 await p.locator('img').first().dispatchEvent('pointerover');await p.getByRole('button',{name:'采集全部图片'}).click();
 await p.waitForFunction(()=>document.querySelector('#closet-collector').shadowRoot.querySelector('.status').textContent.includes('保持网站页面打开'));
 assert(await p.getByRole('link',{name:/登录 Closet4U 后重试/}).isVisible());
 await p.getByRole('status').focus();await p.keyboard.press('Escape');assert(await p.getByRole('status').isHidden());
 console.log('PASS: submit task 2 while task 1 still collecting; both task rows retained; completion/failure delivered in-page');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
