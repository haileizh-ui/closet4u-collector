(() => {
 try {
  const hostname=location.hostname;
  const unique=items=>[...new Set(items.filter(Boolean))];
  const asUrl=u=>{if(typeof u!=='string'||!u.trim())return '';try{const x=new URL(u,location.href);return /^https?:$/.test(x.protocol)?x.href:''}catch{return ''}};
  if(hostname==='mp.weixin.qq.com'){
    const scripts=[...document.scripts].map(s=>s.textContent||'').filter(s=>/user_name|nick_name|picture_page_info_list|\bbiz\b/.test(s)).join('\n').slice(0,8000000);
    const decode=s=>s.replace(/\\x([a-f0-9]{2})/gi,(_,v)=>String.fromCharCode(parseInt(v,16))).replace(/\\u([a-f0-9]{4})/gi,(_,v)=>String.fromCharCode(parseInt(v,16))).replace(/\\(['"\\/])/g,'$1').replace(/&amp;/g,'&');
    const field=name=>{
      const obj=window.cgiDataNew||window.cgiData||{};
      if(typeof obj[name]==='string'&&obj[name])return obj[name];
      if(typeof window[name]==='string'&&window[name])return window[name];
      const re=new RegExp('\\b'+name+'\\s*[:=]\\s*([\'\"])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1');
      return decode(scripts.match(re)?.[2]||'');
    };
    const biz=new URLSearchParams(location.search).get('__biz')||field('biz');
    const author={userId:field('user_name')|| (biz?'wx-biz-'+biz:''),nickname:document.querySelector('#js_name,.profile_nickname')?.textContent.trim()||field('nick_name')};
    const body=document.querySelector('#js_content');
    let images=[];
    const section=scripts.match(/picture_page_info_list\s*:\s*\[([\s\S]*?)\]\s*,\s*(?:locationlist|hotspotinfolist)/)?.[1];
    if(section){
      let depth=0;
      const tokens=section.matchAll(/\bcdn_url\s*:\s*'((?:\\.|[^'])*)'|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|[{}]/g);
      for(const t of tokens){if(t[0]==='{')depth++;else if(t[0]==='}')depth--;else if(depth===1&&t[1])images.push(asUrl(decode(t[1])))}
    }
    if(!images.length)images=[...document.querySelectorAll('#js_content img,#js_image_container img,.js_image_pages img')].map(i=>asUrl(i.getAttribute('data-src')||i.currentSrc||i.src));
    images=unique(images).filter(u=>{try{return ['mmbiz.qpic.cn','mmecoa.qpic.cn','mmbiz.qlogo.cn'].includes(new URL(u).hostname)}catch{return false}});
    if(!author.userId||!author.nickname)throw Error('未读取到公众号信息，请打开完整文章后重试');
    if(!images.length)throw Error('未读取到文章图片，请等待页面加载后重试');
    return {platform:'wechat',author,source_url:location.href,title:document.querySelector('#activity-name')?.textContent.trim()||document.querySelector('meta[property="og:title"]')?.content||document.title,
      text:(body||document.querySelector('#js_image_desc'))?.innerText||'',images};
  }
  if(hostname==='www.douyin.com'){
    const validId=value=>/^\d{10,30}$/.test(String(value||''))?String(value):'';
    const routeId=validId(location.pathname.match(/\/video\/(\d{10,30})/)?.[1]||new URLSearchParams(location.search).get('modal_id')||new URLSearchParams(location.search).get('vid'));
    const visibleArea=el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return style.display==='none'||style.visibility==='hidden'?0:Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0))};
    const videos=[...document.querySelectorAll('video')].filter(v=>{const r=v.getBoundingClientRect();return r.width>150&&r.height>150&&visibleArea(v)>22500});
    // A marker from an earlier hover must never win over the currently playing feed item.
    const video=videos.sort((a,b)=>Number(b.paused===false)-Number(a.paused===false)||visibleArea(b)-visibleArea(a)||Number(b.dataset.closetCurrent==='1')-Number(a.dataset.closetCurrent==='1'))[0];
    const detailId=value=>validId(value?.aweme_id||value?.awemeId);
    function details(root,wanted=''){
      const seen=new WeakSet(),found=new Map();let visits=0;
      function walk(value,depth=0){
        if(!value||typeof value!=='object'||depth>18||visits++>50000||seen.has(value))return;
        seen.add(value);
        const key=detailId(value);
        if(key&&(!wanted||key===wanted)&&(value.video||value.author||value.authorInfo)){
          const old=found.get(key),score=v=>Number(Boolean(v?.video))+Number(Boolean(v?.author||v?.authorInfo))+Number(Boolean(v?.desc||v?.caption));
          if(!old||score(value)>score(old))found.set(key,value);
        }
        // React ownership links can point to another buffered video or the whole feed.
        for(const key of Object.keys(value))if(!['_owner','return','sibling','alternate'].includes(key))walk(value[key],depth+1);
      }
      walk(root);return [...found.values()];
    }
    const localRoots=[];let id='',localDetail;
    const sources=video?[video.currentSrc,video.src,...[...video.querySelectorAll('source')].map(s=>s.src)]:[];
    // Infer IDs only from the selected player/card, never from the first item in global state.
    for(let node=video,level=0;node&&level<12;node=node.parentElement,level++){
      if(node!==video&&node.querySelectorAll('video').length>1)break;
      if(!id)id=validId(node.getAttribute('data-e2e-aweme-id')||node.getAttribute('data-aweme-id'));
      for(const key of Object.keys(node).filter(k=>k.startsWith('__reactProps$')||k.startsWith('__reactFiber$'))){
        const value=node[key],props=value?.memoizedProps||value;
        localRoots.push(props);
        if(!id&&!routeId){
          const candidates=details(props);
          if(candidates.length===1){localDetail=candidates[0];id=detailId(localDetail)}
          else if(candidates.length>1){
            const matching=candidates.filter(d=>{const v=d.video||{},a=v.play_addr||v.playAddr||{};return [...(a.url_list||a.urlList||[]),a.src].some(u=>u&&sources.includes(u))});
            if(matching.length===1){localDetail=matching[0];id=detailId(localDetail)}
          }
        }
      }
      if(id)break;
      // Do not infer from a container that owns several buffered players.
      if(node.querySelectorAll('video').length>1)break;
      const links=unique([...node.querySelectorAll('a[href*="/video/"]')].map(a=>validId(a.href.match(/\/video\/(\d{10,30})/)?.[1])));
      if(!routeId&&links.length===1){id=links[0];break}
    }
    if(!id&&!routeId){
      const sourceIds=unique(sources.map(u=>{try{return validId(new URL(u).searchParams.get('__vid'))}catch{return ''}}));
      if(sourceIds.length===1)id=sourceIds[0];
    }
    if(id&&routeId&&id!==routeId)throw Error('视频正在切换，请稍候再采集当前视频');
    id=id||routeId;
    if(!id)throw Error('未读取到当前播放视频的作品链接，请先播放推荐视频后重试，或打开视频详情页采集');
    const roots=[...localRoots,window.__INITIAL_STATE__,window._ROUTER_DATA,window.__NEXT_DATA__];
    for(const script of document.querySelectorAll('script#RENDER_DATA,script#__NEXT_DATA__,script[type="application/json"]')){
      if(script.textContent.length>8000000)continue;
      try{roots.push(JSON.parse(script.id==='RENDER_DATA'?decodeURIComponent(script.textContent):script.textContent))}catch{}
    }
    const detail=localDetail||roots.map(r=>details(r,id)[0]).find(Boolean)||{};
    const rawAuthor=detail.author||detail.authorInfo||{};
    const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};
    const uid=a=>a?.href?.match(/\/user\/([A-Za-z0-9_-]+)/)?.[1]||'';
    const name=a=>(a?.querySelector('[data-click-from="title"]')?.textContent||a?.textContent||a?.querySelector('img')?.alt?.replace(/头像$/,'')||'').trim().replace(/^@/,'');
    let scope=video?.parentElement,link;
    const exact=[...document.querySelectorAll('[data-e2e-aweme-id]')].find(el=>el.getAttribute('data-e2e-aweme-id')===id&&visible(el));
    // Prefer the current video's author card, excluding comments and recommendations.
    for(let node=exact||scope,level=0;node&&level<12;node=node.parentElement,level++){
      const cards=[...node.querySelectorAll('[data-e2e="user-info"]')].filter(visible);
      const links=cards.flatMap(card=>[...card.querySelectorAll('a[href*="/user/"]')]).filter(a=>uid(a));
      const ids=unique(links.map(uid));
      if(ids.length===1){link=links.find(a=>name(a))||links[0];scope=node;break}
      if(ids.length>1)break;
    }
    if(!link){
      for(let node=exact||scope,level=0;node&&level<10;node=node.parentElement,level++){
        const links=[...node.querySelectorAll('a[href*="/user/"]')].filter(a=>visible(a)&&!a.closest('[data-e2e*="comment"]'));
        if(unique(links.map(uid)).length===1&&links.length){link=links.find(a=>name(a))||links[0];scope=node;break}
      }
    }
    const author={userId:rawAuthor.sec_uid||rawAuthor.secUid||uid(link),nickname:rawAuthor.nickname||rawAuthor.nickName||name(link)};
    if(!author.userId||!author.nickname)throw Error('未读取到当前视频的博主，请打开视频详情并播放后重试');
    const media=detail.video||{},addr=media.play_addr||media.playAddr||{};
    const rawUrls=[...(addr.url_list||addr.urlList||[]),addr.src,video?.currentSrc,video?.src,...(video?[...video.querySelectorAll('source')].map(s=>s.src):[])];
    const video_urls=unique(rawUrls.map(asUrl)).filter(u=>/(^|\.)(douyinvod\.com|douyincdn\.com|douyin\.com|bytecdn\.cn|snssdk\.com|amemv\.com|zjcdn\.com|ixigua\.com)$/.test(new URL(u).hostname));
    const text=detail.desc||detail.caption||scope?.querySelector('[data-e2e="video-desc"],[data-e2e="video-title"]')?.textContent.trim()||document.title;
    return {platform:'douyin',note_id:id,source_url:'https://www.douyin.com/video/'+id,author,title:String(text).slice(0,2000),text,video_urls,images:[]};
  }
  throw Error('不支持的采集页面');
 } catch(error) { return {error:error.message||'页面读取失败'}; }
})();
