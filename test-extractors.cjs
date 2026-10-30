const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await b.newPage({viewport:{width:1200,height:900}});
 const code=fs.readFileSync(path.join(__dirname,'extractors.js'),'utf8');
 const content=fs.readFileSync(path.join(__dirname,'content.js'),'utf8');
 const article=`<meta property="og:title" content="文章标题"><script>var cgiDataNew={user_name:'gh_account',nick_name:'公众号名称'};</script><h1 id="activity-name">文章标题</h1><a id="js_name">公众号名称</a><div id="js_content"><p>完整正文</p><img data-src="http://mmbiz.qpic.cn/image1?wx_fmt=jpeg" style="width:500px;height:300px"><img data-src="https://mmecoa.qpic.cn/image2" style="width:500px;height:300px"></div>`;
 let body=article;
 await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body}));
 await page.goto('https://mp.weixin.qq.com/s/article_one');
 let result=await page.evaluate(code=>eval(code),code);
 assert.equal(result.platform,'wechat');assert.equal(result.author.userId,'gh_account');assert.equal(result.images.length,2);assert(result.text.includes('完整正文'));
 await page.evaluate(()=>{const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'})};window.chrome={runtime:{onMessage:{addListener:()=>{}},sendMessage:async()=>({ok:false,error:'test stop'})}}});
 await page.addScriptTag({content});await page.locator('#js_content img').first().dispatchEvent('pointerover');
 assert(await page.getByRole('button',{name:'采集全部图片'}).isVisible());
 body=`<script>var cgiDataNew={user_name:'gh_account',nick_name:'公众号名称',picture_page_info_list:[{cdn_url:'https://mmbiz.qpic.cn/one',share:{cdn_url:'https://mmbiz.qpic.cn/not-an-article-image'}},{cdn_url:'https://mmbiz.qpic.cn/two'}],locationlist:[]};</script><div id="js_image_desc">图集描述</div>`;
 await page.goto('https://mp.weixin.qq.com/s?__biz=MzExample&mid=123&idx=1&sn=signature');
 result=await page.evaluate(code=>eval(code),code);assert.equal(result.images.length,2);assert(!result.images.some(u=>u.includes('not-an')));assert.equal(result.author.nickname,'公众号名称');
 body=`<script>window._ROUTER_DATA={detail:{aweme_id:'1234567890123456789',author:{sec_uid:'MS4wLjABauthor',nickname:'视频博主'},desc:'视频正文',video:{play_addr:{url_list:['https://v26.douyinvod.com/video.mp4']}}}};</script><video style="width:500px;height:600px"></video>`;
 await page.goto('https://www.douyin.com/video/1234567890123456789');
 result=await page.evaluate(code=>eval(code),code);assert.equal(result.platform,'douyin');assert.equal(result.author.userId,'MS4wLjABauthor');assert.equal(result.video_urls.length,1);assert.equal(result.video_urls[0],'https://v26.douyinvod.com/video.mp4');
 await page.evaluate(()=>{const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'})};window.chrome={runtime:{onMessage:{addListener:()=>{}},sendMessage:async()=>({ok:false,error:'test stop'})}}});
 await page.addScriptTag({content});await page.locator('video').dispatchEvent('pointerover');assert(await page.getByRole('button',{name:'采集视频到Closet'}).isVisible());
 // Profile modal: author card is a sibling of a deeply nested player, with avatar-only link.
 body=`<div data-e2e-aweme-id="7628540743641138267"><div><div><div><div><div><div><div><div><video style="width:500px;height:600px"></video></div></div></div></div></div></div></div></div><div data-e2e="user-info"><a href="/user/MS4wLjABmodalAuthor"><img alt="弹层博主头像" src="/avatar.png"></a></div><div data-e2e="comment-list"><a href="/user/MS4wLjABcommenter">评论用户</a></div></div><a href="/user/MS4wLjABloggedIn">登录账号</a>`;
 await page.goto('https://www.douyin.com/user/MS4wLjABprofileOwner?modal_id=7628540743641138267');
 result=await page.evaluate(code=>eval(code),code);assert.equal(result.author.userId,'MS4wLjABmodalAuthor');assert.equal(result.author.nickname,'弹层博主');assert.equal(result.note_id,'7628540743641138267');
 // Modal navigation can expose detail only in current player React props.
 body='<video style="width:500px;height:600px"></video>';
 await page.goto('https://www.douyin.com/user/MS4wLjABprofileOwner?modal_id=7628540743641138267');
 await page.evaluate(()=>{document.querySelector('video').__reactProps$fixture={item:{awemeId:'7628540743641138267',authorInfo:{secUid:'MS4wLjABreactAuthor',nickname:'React博主'},video:{playAddr:{urlList:['https://v26.douyinvod.com/current.mp4']}}}}});
 result=await page.evaluate(code=>eval(code),code);assert.equal(result.author.userId,'MS4wLjABreactAuthor');assert.equal(result.video_urls[0],'https://v26.douyinvod.com/current.mp4');
 // Never substitute the profile owner or logged-in user's identity without current detail evidence.
 body='<a href="/user/MS4wLjABprofileOwner">主页博主</a><a href="/user/MS4wLjABother">其他用户</a><video style="width:500px;height:600px"></video>';
 await page.goto('https://www.douyin.com/user/MS4wLjABprofileOwner?modal_id=7628540743641138267');
 result=await page.evaluate(code=>eval(code),code);assert(/当前视频的博主/.test(result.error));
 // Recommended feed must collect the playing item, not the first hydration/preload item.
 body=`<script>window._ROUTER_DATA={items:[{aweme_id:'1234567890123456789',author:{sec_uid:'MS4wLjABprevious',nickname:'上一条'},video:{}},{aweme_id:'7628540743641138267',author:{sec_uid:'MS4wLjABcurrent',nickname:'当前博主'},desc:'当前推荐正文',video:{play_addr:{url_list:['https://v26.douyinvod.com/current.mp4']}}}]};</script><div data-e2e-aweme-id="1234567890123456789"><video id="stale" data-closet-current="1" style="position:absolute;left:0;top:0;width:250px;height:600px"></video></div><div data-e2e-aweme-id="7628540743641138267"><video id="playing" style="position:absolute;left:400px;top:0;width:500px;height:700px"></video></div><video style="position:absolute;top:1500px;width:800px;height:700px"></video>`;
 await page.goto('https://www.douyin.com/?recommend=1');
 await page.evaluate(()=>{Object.defineProperty(document.querySelector('#playing'),'paused',{value:false,configurable:true})});
 result=await page.evaluate(code=>eval(code),code);assert.equal(result.note_id,'7628540743641138267');assert.equal(result.author.nickname,'当前博主');assert.equal(result.source_url,'https://www.douyin.com/video/7628540743641138267');assert.equal(result.video_urls[0],'https://v26.douyinvod.com/current.mp4');
 // Blob-based playback still supplies a canonical detail link for backend resolution.
 body='<div id="card"><video style="width:500px;height:600px"></video></div>';
 await page.goto('https://www.douyin.com/?recommend=1');
 await page.evaluate(()=>{document.querySelector('#card').__reactProps$fixture={awemeInfo:{awemeId:'7628540743641138267',authorInfo:{secUid:'MS4wLjABfeed',nickname:'推荐博主'},desc:'推荐正文',video:{}}};document.querySelector('video').__reactFiber$fixture={memoizedProps:{},sibling:{memoizedProps:{aweme_id:'1234567890123456789',author:{sec_uid:'wrong',nickname:'旁边的视频'},video:{}}}}});
 result=await page.evaluate(code=>eval(code),code);assert.equal(result.author.userId,'MS4wLjABfeed');assert.equal(result.video_urls.length,0);assert.equal(result.source_url,'https://www.douyin.com/video/7628540743641138267');
 await page.evaluate(()=>{document.querySelector('#card').__reactProps$fixture.awemeInfo={awemeId:'7628540743641138268',authorInfo:{secUid:'MS4wLjABnext',nickname:'下一条博主'},desc:'下一条正文',video:{}}});
 result=await page.evaluate(code=>eval(code),code);assert.equal(result.note_id,'7628540743641138268');assert.equal(result.author.nickname,'下一条博主');
 // A local share/detail link can identify a feed item without React data.
 body='<div data-e2e="feed-card"><video style="width:500px;height:600px"></video><a href="/video/7628540743641138267">作品链接</a><div data-e2e="user-info"><a href="/user/MS4wLjABlinkAuthor">链接博主</a></div></div>';
 await page.goto('https://www.douyin.com/?recommend=1');result=await page.evaluate(code=>eval(code),code);assert.equal(result.note_id,'7628540743641138267');assert.equal(result.author.nickname,'链接博主');
 // Global recommendation state alone cannot establish which video is currently playing.
 body='<div id="feed"><div><video style="width:500px;height:600px"></video></div><div><video style="position:absolute;top:1200px;width:500px;height:600px"></video></div></div>';
 await page.goto('https://www.douyin.com/?recommend=1');
 await page.evaluate(()=>{document.querySelector('#feed').__reactProps$fixture={item:{aweme_id:'1234567890123456789',author:{sec_uid:'wrong',nickname:'全局缓存'},video:{}}};window._ROUTER_DATA=document.querySelector('#feed').__reactProps$fixture});
 result=await page.evaluate(code=>eval(code),code);assert(/当前播放视频/.test(result.error));
 await page.goto('https://www.douyin.com/');result=await page.evaluate(code=>eval(code),code);assert(/视频详情/.test(result.error));
 console.log('PASS: WeChat article/gallery metadata, complete image order, nested cover exclusion; Douyin current video state, no undefined URLs; platform hover buttons');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
