const DEFAULT_SERVER = 'https://closet.cuddlycuddle.com';
const FALLBACK_SERVER = 'https://danime.dawoai.com/closet';
const storageReady = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
function serverURL(value = DEFAULT_SERVER) {
  const u = new URL(value);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('消费站地址必须使用 HTTPS');
  if (u.username || u.password || u.search || u.hash) throw new Error('消费站地址无效');
  return u.href.replace(/\/+$/, '');
}
async function connect(server, openLogin = false) {
  await storageReady;
  server = serverURL(server);
  const url = new URL(server);
  const granted = await chrome.permissions.contains({origins: [url.origin + '/*']});
  if (!granted) throw new Error('请在扩展设置中保存地址，并授予消费站访问权限');
  const tabs = await chrome.tabs.query({url: url.origin + '/*'});
  const basePath = url.pathname.replace(/\/$/, '');
  for (const tab of tabs.filter(t => {
    const path = new URL(t.url).pathname;
    return !basePath || path === basePath || path.startsWith(basePath + '/');
  })) {
    try {
      // Isolated content world fetch uses the consumer page's own authenticated session.
      // Credentials are returned directly to the worker, never through window.postMessage.
      const [{result}] = await chrome.scripting.executeScript({target: {tabId: tab.id}, world: 'ISOLATED',
        func: async endpoint => {
          const response = await fetch(endpoint, {method: 'POST', credentials: 'include', cache: 'no-store',
            headers: {'X-Closet-Bootstrap': '1'}, signal: AbortSignal.timeout(15000)});
          if (!response.ok) return {error: response.status === 401 ? '请先登录 Closet4U，再点击自动连接' : '连接失败（HTTP ' + response.status + '）'};
          return response.json();
        }, args: [server + '/api/closet-extension/token']});
      if (result?.token && result.expires_at) {
        await chrome.storage.local.set({server, token: result.token, expiresAt: result.expires_at, user: result.user, authVersion: 2});
        return result;
      }
    } catch (_) { /* A loading/closed tab must not prevent trying another authenticated tab. */ }
  }
  await chrome.storage.local.remove(['token', 'expiresAt', 'user', 'authVersion']);
  if (openLogin) await chrome.tabs.create({url: server + '/wardrobe'});
  throw new Error('请在已打开的消费站登录 Closet4U，然后点击“自动连接登录账号”');
}
async function autoConnect(preferredServer) {
  const config = await chrome.storage.local.get('server');
  const server = preferredServer || config.server;
  const candidates = !server || [DEFAULT_SERVER, FALLBACK_SERVER].includes(server)
    ? [...new Set([server || DEFAULT_SERVER, DEFAULT_SERVER, FALLBACK_SERVER])] : [server];
  let lastError;
  for (const candidate of candidates) {
    try { return await connect(candidate); } catch (error) { lastError = error; }
  }
  throw lastError;
}
async function request(path, body, expected) {
  await storageReady;
  let config = await chrome.storage.local.get(['server', 'token', 'expiresAt', 'authVersion', 'user']);
  let server = serverURL(config.server);
  if (!config.token || config.authVersion !== 2 || config.expiresAt < Date.now() / 1000 + 30) {
    try{await autoConnect()}catch(error){error.status=401;throw error;}
    config = await chrome.storage.local.get(['token', 'server', 'user']);
    server = serverURL(config.server);
  }
  if(expected&&(server!==expected.server||config.user?.id!==expected.ownerId)){const error=new Error('请切回提交任务的消费站账号后继续查看');error.status=401;throw error;}
  const response = await fetch(server + '/api/closet-extension/' + path, {
    method: body ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.token},
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(24000), cache: 'no-store', credentials: 'omit'
  });
  let result;
  try { result = await response.json(); } catch (_) { throw new Error('消费站返回异常，请检查服务地址'); }
  if (response.status === 401) {
    await chrome.storage.local.remove(['token', 'expiresAt', 'user']);
    const error=new Error('登录凭据已失效，请在消费站登录后重新连接');error.status=401;throw error;
  }
  if (!response.ok){const error=new Error(result.detail || '服务请求失败');error.status=response.status;throw error;}
  return result;
}
async function notifyConsumers() {
  const {server} = await chrome.storage.local.get('server');
  if (!server) return;
  const url = new URL(server);
  const tabs = await chrome.tabs.query({url: url.origin + '/*'});
  await Promise.allSettled(tabs.filter(tab => {
    const path = new URL(tab.url).pathname, base = url.pathname.replace(/\/$/, '');
    return !base || path === base || path.startsWith(base + '/');
  }).map(tab => chrome.scripting.executeScript({target: {tabId: tab.id}, world: 'ISOLATED',
    func: () => window.dispatchEvent(new CustomEvent('closet:collection-changed'))})));
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    if (message.type === 'connect' && !sender.tab) {
      const selected = serverURL(message.server || DEFAULT_SERVER);
      const result = !message.openLogin && [DEFAULT_SERVER, FALLBACK_SERVER].includes(selected)
        ? await autoConnect(selected) : await connect(selected, message.openLogin);
      await request('health');
      CollectionTasks.pump().catch(()=>{});
      return {user: result.user, expires_at: result.expires_at};
    }
    if (message.type === 'auto-connect' && !sender.tab) {
      const result=await autoConnect();
      CollectionTasks.pump().catch(()=>{});
      return result;
    }
    if(message.type==='tasks')return CollectionTasks.list();
    if(message.type==='website'){await storageReady;const config=await chrome.storage.local.get('server');return {url:serverURL(config.server)}}
    if (!sender.tab || !['www.xiaohongshu.com','www.rednote.com','www.douyin.com','mp.weixin.qq.com'].includes(new URL(sender.tab.url).hostname)) throw new Error('不支持的采集页面');
    if (message.type === 'status' && typeof message.jobId === 'string' && message.jobId.length < 4096) {
      const result = await request('jobs/' + encodeURIComponent(message.jobId));
      if (result.status === 'completed') await notifyConsumers();
      return result;
    }
    if (message.type !== 'collect') throw new Error('不支持的采集请求');
    if (!['www.xiaohongshu.com','www.rednote.com'].includes(new URL(sender.tab.url).hostname)) {
      const [{result: note}] = await chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:'MAIN',files:['extractors.js']});
      if (!note) throw new Error('未读取到当前页面，请刷新后重试');
      if(note.error)throw new Error(note.error);
      note.mode=message.mode;
      if(note.platform==='wechat'&&message.mode==='single'){
        const key=u=>new URL(u).hostname+new URL(u).pathname;
        const selected=note.images.find(u=>key(u)===key(message.image));
        if(!selected)throw new Error('当前图片不在文章图集中，请等待图片加载后重试');
        note.images=[selected];
      }
      const result=await request('collect',note);
      const trackingId=await CollectionTasks.track(result,note,sender.tab.id);
      await notifyConsumers();
      return {...result,tracking_id:trackingId};
    }
    const [{result: note}] = await chrome.scripting.executeScript({target: {tabId: sender.tab.id}, world: 'MAIN',
      func: () => {
        const id = location.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/)?.[1]
          || new URLSearchParams(location.search).get('noteId');
        const n = window.__INITIAL_STATE__?.note?.noteDetailMap?.[id]?.note;
        if (!n) return null;
        const author={...n.user};
        if(!author.avatar&&!author.avatarUrl&&/^[a-f0-9]{24}$/.test(String(author.userId||''))){
          const link=document.querySelector('.note-detail-mask a[href*="/user/profile/'+author.userId+'"],.note-container a[href*="/user/profile/'+author.userId+'"]');
          const img=link?.querySelector('img')||link?.closest('.author-container')?.querySelector('img');
          author.avatar=img?.currentSrc||img?.src||'';
        }
        return JSON.parse(JSON.stringify({note_id: id, title: n.title, text: n.desc, author,
          type: n.type, video_stream: n.video?.media?.stream,
          images: (n.imageList || []).map(i => i.urlDefault || i.infoList?.find(x => x.imageScene === 'WB_DFT')?.url || i.urlPre).filter(Boolean)}));
      }});
    if (!note) throw new Error('未读取到完整笔记，请打开笔记详情并刷新后重试');
    if (message.mode === 'video') {
      if (!note.video_stream || !Object.keys(note.video_stream).length) throw new Error('未读取到视频流，请先播放视频后重试');
      note.images = [];
    } else {
      if (note.type === 'video') throw new Error('这是视频笔记，请使用“采集视频到Closet”');
      if (!note.images?.length) throw new Error('未读取到笔记图集，请稍候重试');
      if (message.mode === 'single') {
        const key = u => new URL(u).pathname.split('!')[0];
        const selected = note.images.find(u => key(u) === key(message.image));
        if (!selected) throw new Error('当前图片未匹配笔记图集，请稍候重试');
        note.images = [selected];
      }
      delete note.video_stream;
    }
    note.mode = message.mode;
    const result = await request('collect', note);
    const trackingId=await CollectionTasks.track(result,note,sender.tab.id);
    await notifyConsumers();
    return {...result,tracking_id:trackingId};
  })().then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message, status: error.status}));
  return true;
});

importScripts('task-tracker.js');
