const form = document.querySelector('form'), status = document.querySelector('#status');
function parseServer() {
  const url = new URL(form.elements.server.value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('请使用 HTTPS 地址；本机服务可使用 HTTP');
  if (url.username || url.password || url.search || url.hash) throw new Error('请输入消费站地址，不包含账号或查询参数');
  return {server: url.href.replace(/\/+$/, ''), origin: url.origin};
}
async function showConnected(result) {
  const config = await chrome.storage.local.get(['server', 'token']);
  if (config.server) form.elements.server.value = config.server;
  form.elements.token.value = config.token || '';
  status.textContent = '已连接 ' + (result.user?.nickname || 'Closet4U 登录账号') + '。凭据会自动刷新，退出登录后失效。';
}
async function connect(openLogin = false) {
  try {
    const {server, origin} = parseServer();
    if (!await chrome.permissions.request({origins: [origin + '/*']})) throw new Error('未授予消费站访问权限');
    status.textContent = '正在获取登录账号的采集凭据…';
    const result = await chrome.runtime.sendMessage({type: 'connect', server, openLogin});
    if (!result.ok) throw new Error(result.error);
    await showConnected(result.data);
  } catch (error) { form.elements.token.value = ''; status.textContent = error.message; }
}
form.addEventListener('submit', e => { e.preventDefault(); connect(); });
document.querySelector('#login').addEventListener('click', () => connect(true));
(async () => {
  const config = await chrome.storage.local.get('server');
  if (config.server) form.elements.server.value = config.server;
  status.textContent = '正在连接已登录的消费站…';
  const result = await chrome.runtime.sendMessage({type: 'auto-connect'});
  if (result.ok) await showConnected(result.data);
  else status.textContent = result.error;
})();

let taskHistoryOpen=false;
async function refreshCollectionTasks(){
  try{
    const result=await chrome.runtime.sendMessage({type:'tasks'});
    if(!result.ok||!Array.isArray(result.data))return;
    const box=document.getElementById('tasks');box.replaceChildren();
    if(!result.data.length)return;
    const heading=document.createElement('h2');heading.textContent='最近采集任务';heading.style.fontSize='15px';box.append(heading);
    const labels={queued:'已提交',collecting:'排队/采集中',publishing:'发布中',completed:'已完成',failed:'未完成',waiting_login:'等待登录原账号'};
    CollectionHistoryUI.render(box,result.data,job=>{
      const row=document.createElement('p');row.textContent=job.title+' · '+(labels[job.phase]||job.phase)+String.fromCharCode(10)+(job.error||job.message||'');row.style.whiteSpace='pre-line';return row;
    },{open:taskHistoryOpen,onToggle:open=>{taskHistoryOpen=open}});
  }catch{}
}
refreshCollectionTasks();setInterval(refreshCollectionTasks,2000);
