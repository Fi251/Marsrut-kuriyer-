/* ===================== STATE ===================== */
let state = { orders: [], couriers: [] };
let role = localStorage.getItem('marsrut_role');       // 'admin' | 'courier'
let myCourierId = localStorage.getItem('marsrut_courier_id') || null;
let adminToken = localStorage.getItem('marsrut_admin_token') || null;
let view = null;
let orderFilter = 'hamisi';
let orderSearch = '';
let reportRange = 'today';
let courierTab = 'yeni';
let knownOrderIds = new Set();
let firstLoad = true;
let modalOpen = false;
let courierMap = null;
let courierMarker = null;
let locationSharing = false;
let locationShareInterval = null;

/* ===================== API ===================== */
async function api(path, opts){
  const res = await fetch(path, Object.assign({headers:{'Content-Type':'application/json'}}, opts));
  let data = null;
  try{ data = await res.json(); }catch(e){}
  if(!res.ok) throw new Error((data && data.error) || 'Xəta baş verdi');
  return data;
}
// İdarəçi girişi tələb edən sorğular üçün (sifariş/kuryer yaratmaq və silmək)
async function adminApi(path, opts){
  opts = opts || {};
  const headers = Object.assign({'Content-Type':'application/json','X-Admin-Token': adminToken || ''}, opts.headers||{});
  const res = await fetch(path, Object.assign({}, opts, {headers}));
  let data = null;
  try{ data = await res.json(); }catch(e){}
  if(res.status===401){
    toast('Sessiya bitib, yenidən daxil ol');
    switchRole();
    throw new Error('Sessiya bitib');
  }
  if(!res.ok) throw new Error((data && data.error) || 'Xəta baş verdi');
  return data;
}
async function fetchState(){
  try{
    const data = await api('/api/state');
    state = data;
    setConn(true);
    checkNewOrders();
    if(!modalOpen) render();
  }catch(e){
    setConn(false);
  }
}
function setConn(ok){
  const el = document.getElementById('connLed');
  if(el) el.classList.toggle('off', !ok);
}
function checkNewOrders(){
  const ids = new Set(state.orders.map(o=>o.id));
  if(!firstLoad){
    const newOnes = state.orders.filter(o=>!knownOrderIds.has(o.id) && o.status==='yeni');
    if(newOnes.length && role==='courier'){
      toast(newOnes.length===1 ? 'Yeni sifariş daxil oldu!' : newOnes.length+' yeni sifariş daxil oldu!');
      try{ navigator.vibrate && navigator.vibrate([80,40,80]); }catch(e){}
    }
  }
  knownOrderIds = ids;
  firstLoad = false;
}
setInterval(fetchState, 4000);

/* ===================== HELPERS ===================== */
const STATUS_LABEL = { yeni:'Yeni', tayin:'Təyin edilib', yolda:'Yolda', catdirildi:'Çatdırıldı', legv:'Ləğv edilib' };
const STATUS_ORDER = ['yeni','tayin','yolda','catdirildi'];
function fmtMoney(n){ return (Number(n)||0).toFixed(2).replace(/\.00$/,'') + ' ₼'; }
function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString('az-AZ',{day:'2-digit',month:'short'}) + ' · ' + d.toLocaleTimeString('az-AZ',{hour:'2-digit',minute:'2-digit'}); }
function todayStr(){ return new Date().toLocaleDateString('az-AZ',{weekday:'long', day:'2-digit', month:'long'}); }
function isSameDay(ts, ref){ const a=new Date(ts); return a.getFullYear()===ref.getFullYear() && a.getMonth()===ref.getMonth() && a.getDate()===ref.getDate(); }
function inRange(ts, range){
  const now = new Date(); const d = new Date(ts);
  if(range==='today') return isSameDay(ts, now);
  if(range==='week'){ const w=new Date(now); w.setDate(now.getDate()-7); return d>=w; }
  if(range==='month') return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  return true;
}
function courierById(id){ return state.couriers.find(c=>c.id===id); }
function activeOrdersFor(courierId){ return state.orders.filter(o=>o.courierId===courierId && (o.status==='tayin'||o.status==='yolda')).length; }
function vehicleLabel(v){ return {motosiklet:'Motosiklet', avtomobil:'Avtomobil', velosiped:'Velosiped', piyada:'Piyada'}[v] || v; }
function escapeHTML(str){ return String(str||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function toast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(window._toastT); window._toastT = setTimeout(()=>t.classList.remove('show'), 2400);
}

/* ===================== ROLE GATE ===================== */
function showGate(){
  document.getElementById('app').style.display = 'none';
  const gate = document.getElementById('gate');
  gate.style.display = 'flex';
  gate.innerHTML = `
    <div class="gate-inner">
      <span class="dot"></span>
      <h1>Marşrut</h1>
      <p class="lead">Kuryer idarəetmə sisteminə xoş gəldin. Rolunu seç:</p>
      <div class="role-opt" onclick="showAdminLogin()">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg></div>
        <div><div class="tt">İdarəçiyəm</div><div class="dd">Sifariş yarat, kuryerləri idarə et, hesabata bax</div></div>
      </div>
      <div class="role-opt" onclick="showCourierPick()">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 18h6"/><path d="M6 15l2-8h4l1 3h4"/></svg></div>
        <div><div class="tt">Kuryeryəm</div><div class="dd">Yeni sifarişlərə bax, özünə təyin et</div></div>
      </div>
    </div>
  `;
}
async function showCourierPick(){
  try{ state = await api('/api/state'); }catch(e){}
  const gate = document.getElementById('gate');
  const list = state.couriers;
  gate.innerHTML = `
    <div class="gate-inner">
      <span class="dot"></span>
      <h1>Sən kimsən?</h1>
      <p class="lead">Siyahıdan öz adını seç.</p>
      ${list.length===0 ? `
        <p style="color:#9AA0B4;font-size:13.5px;line-height:1.6;">Hələ kuryer əlavə olunmayıb. İdarəçidən səni sistemə əlavə etməsini xahiş et.</p>
      ` : list.map(c=>`
        <div class="courier-pick" onclick="chooseCourier('${c.id}')">
          <div><div class="tt">${escapeHTML(c.name)}</div><div class="dd">${escapeHTML(vehicleLabel(c.vehicle))}</div></div>
          <span style="color:#7B8098;">›</span>
        </div>
      `).join('')}
      ${window.ENTRY_MODE ? '' : '<button class="backlink" onclick="showGate()">‹ Geri</button>'}
    </div>
  `;
}
function chooseCourier(id){
  localStorage.setItem('marsrut_role','courier');
  localStorage.setItem('marsrut_courier_id', id);
  role='courier'; myCourierId=id;
  startApp();
}
function showAdminLogin(){
  const gate = document.getElementById('gate');
  gate.innerHTML = `
    <div class="gate-inner">
      <span class="dot"></span>
      <h1>İdarəçi girişi</h1>
      <p class="lead">Panelə daxil olmaq üçün şifrəni yaz.</p>
      <div class="field">
        <label style="color:#9AA0B4;">Şifrə</label>
        <input id="admin-pass" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter') submitAdminLogin()">
      </div>
      <button class="btn btn-orange btn-block" id="adminLoginBtn" onclick="submitAdminLogin()">Daxil ol</button>
      ${window.ENTRY_MODE ? '' : '<button class="backlink" onclick="showGate()">‹ Geri</button>'}
    </div>
  `;
  setTimeout(()=>{ const el=document.getElementById('admin-pass'); if(el) el.focus(); }, 60);
}
async function submitAdminLogin(){
  const el = document.getElementById('admin-pass');
  const pass = el ? el.value : '';
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true;
  try{
    const data = await api('/api/admin-login', { method:'POST', body: JSON.stringify({ password: pass }) });
    localStorage.setItem('marsrut_role','admin');
    localStorage.setItem('marsrut_admin_token', data.token);
    role='admin'; adminToken=data.token;
    startApp();
  }catch(e){
    toast(e.message || 'Şifrə yanlışdır');
    btn.disabled = false;
  }
}
function switchRole(){
  localStorage.removeItem('marsrut_role');
  localStorage.removeItem('marsrut_courier_id');
  localStorage.removeItem('marsrut_admin_token');
  role=null; myCourierId=null; adminToken=null;
  if(window.ENTRY_MODE==='admin'){ showAdminLogin(); }
  else if(window.ENTRY_MODE==='courier'){ showCourierPick(); }
  else{ showGate(); }
}

/* ===================== APP SHELL ===================== */
function startApp(){
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  buildNav();
  const who = document.getElementById('whoBox');
  if(role==='admin'){
    who.innerHTML = `<b>İdarəçi</b><span class="conn"><span class="led" id="connLed"></span>Canlı</span> · <a onclick="switchRole()">dəyiş</a>`;
  }else{
    const c = courierById(myCourierId);
    who.innerHTML = `<b>${c?escapeHTML(c.name):'Kuryer'}</b><span class="conn"><span class="led" id="connLed"></span>Canlı</span> · <a onclick="switchRole()">dəyiş</a>`;
  }
  switchView(role==='admin' ? 'dashboard' : 'courier');
  fetchState();
}
function buildNav(){
  const nav = document.getElementById('bottomNav');
  if(role==='admin'){
    nav.innerHTML = `
      <button class="navbtn" data-view="dashboard" onclick="switchView('dashboard')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
        <span>İdarəetmə</span>
      </button>
      <button class="navbtn" data-view="orders" onclick="switchView('orders')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
        <span>Sifarişlər</span>
      </button>
      <button class="navbtn" data-view="couriers" onclick="switchView('couriers')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 18h6"/><path d="M6 15l2-8h4l1 3h4"/></svg>
        <span>Kuryerlər</span>
      </button>
      <button class="navbtn" data-view="reports" onclick="switchView('reports')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
        <span>Hesabat</span>
      </button>
    `;
  }else{
    nav.innerHTML = `
      <button class="navbtn" data-view="courier" onclick="switchView('courier')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
        <span>İşlərim</span>
      </button>
      <button class="navbtn" data-view="map" onclick="switchView('map')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z"/><path d="M9 7v13"/><path d="M15 4v13"/></svg>
        <span>Xəritə</span>
      </button>
    `;
  }
}
function switchView(v){
  view = v;
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  document.getElementById('fabBtn').style.display = (role==='admin' && v!=='dashboard') ? 'flex' : 'none';
  render();
  window.scrollTo(0,0);
  if(v==='map') setTimeout(initCourierMap, 60);
}
function render(){
  const main = document.getElementById('main');
  if(role==='admin'){
    if(view==='dashboard') main.innerHTML = renderDashboard();
    else if(view==='orders') main.innerHTML = renderOrders();
    else if(view==='couriers') main.innerHTML = renderCouriers();
    else if(view==='reports') main.innerHTML = renderReports();
  }else{
    if(view==='map') main.innerHTML = renderCourierMap();
    else main.innerHTML = renderCourierHome();
  }
  buildNav();
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  setConn(true);
}
function openFab(){
  if(view==='couriers') openCourierModal(); else openOrderModal();
}

/* ===================== ROUTE DOTS ===================== */
function routeHTML(status){
  if(status==='legv') return `<div class="badge legv" style="margin-top:10px;">✕ Ləğv edilib</div>`;
  const idx = STATUS_ORDER.indexOf(status);
  let dots = '';
  STATUS_ORDER.forEach((s,i)=>{
    dots += `<div class="stop ${i<=idx?'done':''}"></div>`;
    if(i<STATUS_ORDER.length-1) dots += `<div class="seg ${i<idx?'done':''}"></div>`;
  });
  return `<div class="route">${dots}</div><div class="route-labels"><span>Yeni</span><span>Təyin</span><span>Yolda</span><span>Çatdı</span></div>`;
}

/* ===================== ADMIN: DASHBOARD ===================== */
function renderDashboard(){
  const now = new Date();
  const todays = state.orders.filter(o=>isSameDay(o.createdAt, now));
  const pending = state.orders.filter(o=>o.status==='yeni').length;
  const onWay = state.orders.filter(o=>o.status==='yolda').length;
  const deliveredToday = todays.filter(o=>o.status==='catdirildi').length;
  const activeCouriers = state.couriers.filter(c=>c.status==='aktiv').length;
  const revenueToday = todays.filter(o=>o.status==='catdirildi').reduce((s,o)=>s+(Number(o.fee)||0),0);
  const recent = [...state.orders].sort((a,b)=>b.createdAt-a.createdAt).slice(0,5);
  return `
    <div class="view">
      <div class="sec-title">${todayStr()}</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="bar orange"></div><div class="num">${todays.length}</div><div class="lbl">Bugünkü sifariş</div></div>
        <div class="stat-card"><div class="bar amber"></div><div class="num">${pending}</div><div class="lbl">Gözləyən</div></div>
        <div class="stat-card"><div class="bar teal"></div><div class="num">${onWay}</div><div class="lbl">Yolda</div></div>
        <div class="stat-card"><div class="bar green"></div><div class="num">${deliveredToday}</div><div class="lbl">Bugün çatdırılıb</div></div>
        <div class="stat-card accent"><div class="num">${activeCouriers}</div><div class="lbl">Aktiv kuryer</div></div>
        <div class="stat-card accent"><div class="num mono">${fmtMoney(revenueToday)}</div><div class="lbl">Bugünkü gəlir</div></div>
      </div>
      <div class="sec-title">Son sifarişlər</div>
      ${recent.length===0 ? `<div class="empty"><div class="glyph">◎</div><p><b>Hələ sifariş yoxdur.</b><br>Sifarişlər bölməsindən ilk sifarişi əlavə et.</p></div>`
        : recent.map(o=>orderCardHTML(o,true)).join('')}
    </div>
  `;
}

/* ===================== ADMIN: ORDERS ===================== */
function orderCardHTML(o, compact){
  const courier = courierById(o.courierId);
  return `
    <div class="card" data-id="${o.id}">
      <div class="card-top">
        <div><div class="name">${escapeHTML(o.customerName)}</div><div class="sub">${escapeHTML(o.address)}</div></div>
        <div style="text-align:right;"><span class="badge ${o.status}">${STATUS_LABEL[o.status]}</span><div class="fee">${fmtMoney(o.fee)}</div></div>
      </div>
      ${routeHTML(o.status)}
      <div class="card-meta">
        <span>📞 <span class="mono">${escapeHTML(o.phone||'—')}</span></span>
        <span>${courier ? '🚴 <b>'+escapeHTML(courier.name)+'</b>' : '<b>Kuryer təyin edilməyib</b>'}</span>
        <span>${fmtDate(o.createdAt)}</span>
      </div>
      ${o.notes ? `<div class="card-meta"><span>📝 ${escapeHTML(o.notes)}</span></div>` : ''}
      ${!compact ? orderActionsHTML(o) : ''}
    </div>
  `;
}
function orderActionsHTML(o){
  if(o.status==='legv' || o.status==='catdirildi'){
    return `<div class="card-actions"><button class="btn btn-ghost btn-sm" onclick="deleteOrder('${o.id}')">Sil</button></div>`;
  }
  if(o.status==='yeni'){
    const opts = state.couriers.filter(c=>c.status==='aktiv');
    if(opts.length===0) return `<div class="card-actions"><span class="sub" style="font-size:12px;">Təyin etmək üçün əvvəl aktiv kuryer əlavə et.</span></div>`;
    return `<div class="card-actions">
      <select class="inline-select" id="sel-${o.id}">${opts.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')}</select>
      <button class="btn btn-orange btn-sm" onclick="assignCourier('${o.id}')">Təyin et</button>
      <button class="btn btn-danger btn-sm" onclick="setOrderStatus('${o.id}','legv')">Ləğv et</button>
    </div>`;
  }
  if(o.status==='tayin'){
    return `<div class="card-actions">
      <button class="btn btn-teal btn-sm" onclick="setOrderStatus('${o.id}','yolda')">Yolda kimi qeyd et</button>
      <button class="btn btn-ghost btn-sm" onclick="copyTrackingLink('${o.id}')">🔗 İzləmə linki</button>
      <button class="btn btn-danger btn-sm" onclick="setOrderStatus('${o.id}','legv')">Ləğv et</button>
    </div>`;
  }
  if(o.status==='yolda'){
    return `<div class="card-actions">
      <button class="btn btn-primary btn-sm" onclick="setOrderStatus('${o.id}','catdirildi')">Çatdırıldı kimi qeyd et</button>
      <button class="btn btn-ghost btn-sm" onclick="copyTrackingLink('${o.id}')">🔗 İzləmə linki</button>
    </div>`;
  }
  return '';
}
function renderOrders(){
  const filters = [['hamisi','Hamısı'],['yeni','Yeni'],['tayin','Təyin edilib'],['yolda','Yolda'],['catdirildi','Çatdırıldı'],['legv','Ləğv edilib']];
  let list = state.orders.slice().sort((a,b)=>b.createdAt-a.createdAt);
  if(orderFilter!=='hamisi') list = list.filter(o=>o.status===orderFilter);
  if(orderSearch.trim()){
    const q = orderSearch.trim().toLowerCase();
    list = list.filter(o => (o.customerName||'').toLowerCase().includes(q) || (o.address||'').toLowerCase().includes(q) || (o.phone||'').includes(q));
  }
  return `
    <div class="view">
      <input class="search" placeholder="Müştəri, ünvan və ya nömrə axtar..." value="${escapeHTML(orderSearch)}" oninput="orderSearch=this.value; render();">
      <div class="chips">${filters.map(([k,l])=>`<div class="chip ${orderFilter===k?'active':''}" onclick="orderFilter='${k}'; render();">${l}</div>`).join('')}</div>
      ${list.length===0 ? `<div class="empty"><div class="glyph">◎</div><p><b>Uyğun sifariş tapılmadı.</b><br>Yeni sifariş əlavə etmək üçün + düyməsini bas.</p></div>`
        : list.map(o=>orderCardHTML(o,false)).join('')}
    </div>
  `;
}

/* ===================== ADMIN: COURIERS ===================== */
function courierCardHTML(c){
  const active = activeOrdersFor(c.id);
  const monthEarn = state.orders.filter(o=>o.courierId===c.id && o.status==='catdirildi' && inRange(o.createdAt,'month')).reduce((s,o)=>s+(Number(o.courierFee)||0),0);
  return `
    <div class="card">
      <div class="card-top">
        <div><div class="name">${escapeHTML(c.name)}</div><div class="sub">${escapeHTML(vehicleLabel(c.vehicle))} · <span class="mono">${escapeHTML(c.phone||'—')}</span></div></div>
        <span class="badge ${c.status}">${c.status==='aktiv'?'Aktiv':'Passiv'}</span>
      </div>
      <div class="card-meta"><span>Aktiv sifariş: <b>${active}</b></span><span>Bu ay qazanc: <b class="mono">${fmtMoney(monthEarn)}</b></span></div>
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm" onclick="toggleCourierStatus('${c.id}')">${c.status==='aktiv' ? 'Passiv et' : 'Aktiv et'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCourier('${c.id}')">Sil</button>
      </div>
    </div>
  `;
}
function renderCouriers(){
  const list = state.couriers.slice().sort((a,b)=>b.createdAt-a.createdAt);
  return `
    <div class="view">
      <div class="sec-title">Kuryerlər (${list.length})</div>
      ${list.length===0 ? `<div class="empty"><div class="glyph">◎</div><p><b>Hələ kuryer əlavə olunmayıb.</b><br>Sifarişləri təyin etmək üçün əvvəl kuryer əlavə et.</p></div>`
        : list.map(courierCardHTML).join('')}
    </div>
  `;
}

/* ===================== ADMIN: REPORTS ===================== */
function renderReports(){
  const ranges = [['today','Bugün'],['week','Bu həftə'],['month','Bu ay'],['all','Hamısı']];
  const done = state.orders.filter(o=>o.status==='catdirildi' && inRange(o.createdAt, reportRange));
  const totalOrders = state.orders.filter(o=>inRange(o.createdAt, reportRange)).length;
  const revenue = done.reduce((s,o)=>s+(Number(o.fee)||0),0);
  const payout = done.reduce((s,o)=>s+(Number(o.courierFee)||0),0);
  const profit = revenue - payout;
  const perCourier = state.couriers.map(c=>{
    const co = done.filter(o=>o.courierId===c.id);
    return { name:c.name, count:co.length, earned: co.reduce((s,o)=>s+(Number(o.courierFee)||0),0) };
  }).filter(r=>r.count>0).sort((a,b)=>b.earned-a.earned);
  return `
    <div class="view">
      <div class="report-tabs">${ranges.map(([k,l])=>`<div class="chip ${reportRange===k?'active':''}" onclick="reportRange='${k}'; render();">${l}</div>`).join('')}</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="bar orange"></div><div class="num">${totalOrders}</div><div class="lbl">Ümumi sifariş</div></div>
        <div class="stat-card"><div class="bar green"></div><div class="num">${done.length}</div><div class="lbl">Çatdırılmış</div></div>
        <div class="stat-card accent"><div class="num mono">${fmtMoney(revenue)}</div><div class="lbl">Ümumi gəlir</div></div>
        <div class="stat-card"><div class="bar amber"></div><div class="num mono">${fmtMoney(payout)}</div><div class="lbl">Kuryer ödənişi</div></div>
      </div>
      <div class="stat-card" style="margin-top:10px;background:var(--navy);color:#fff;">
        <div class="num mono" style="color:${profit>=0?'#5EEAD4':'#FCA5A5'};">${fmtMoney(profit)}</div><div class="lbl">Xalis mənfəət</div>
      </div>
      <div class="sec-title">Kuryerlər üzrə bölgü</div>
      ${perCourier.length===0 ? `<div class="empty"><div class="glyph">◎</div><p>Bu dövrdə çatdırılmış sifariş yoxdur.</p></div>` : `
        <table class="rep-table"><thead><tr><th>Kuryer</th><th>Sifariş</th><th>Qazanc</th></tr></thead>
        <tbody>${perCourier.map(r=>`<tr><td>${escapeHTML(r.name)}</td><td>${r.count}</td><td class="mono">${fmtMoney(r.earned)}</td></tr>`).join('')}</tbody></table>
      `}
    </div>
  `;
}

/* ===================== COURIER VIEW ===================== */
function renderCourierHome(){
  const me = courierById(myCourierId);
  if(!me){
    return `<div class="empty"><div class="glyph">◎</div><p><b>Profil tapılmadı.</b><br>İdarəçi səni sistemdən silmiş ola bilər.</p><button class="btn btn-primary" style="margin-top:14px;" onclick="switchRole()">Yenidən seç</button></div>`;
  }
  const unassigned = state.orders.filter(o=>o.status==='yeni').sort((a,b)=>a.createdAt-b.createdAt);
  const mine = state.orders.filter(o=>o.courierId===myCourierId && (o.status==='tayin'||o.status==='yolda')).sort((a,b)=>a.createdAt-b.createdAt);
  const history = state.orders.filter(o=>o.courierId===myCourierId && o.status==='catdirildi').sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
  const monthEarn = state.orders.filter(o=>o.courierId===myCourierId && o.status==='catdirildi' && inRange(o.createdAt,'month')).reduce((s,o)=>s+(Number(o.courierFee)||0),0);

  return `
    <div class="view">
      <div class="stat-grid">
        <div class="stat-card accent"><div class="num">${mine.length}</div><div class="lbl">Mənim aktiv işim</div></div>
        <div class="stat-card accent"><div class="num mono">${fmtMoney(monthEarn)}</div><div class="lbl">Bu ay qazancım</div></div>
      </div>
      <div class="card" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
        <div><div class="name" style="font-size:14px;">Statusum</div><div class="sub">Sifariş almaq üçün aktiv ol</div></div>
        <span class="badge ${me.status}" style="cursor:pointer;" onclick="toggleCourierStatus('${me.id}')">${me.status==='aktiv'?'Aktiv':'Passiv'}</span>
      </div>

      <div class="sec-title">Mənim sifarişlərim ${mine.length?`<span class="cnt">${mine.length}</span>`:''}</div>
      ${mine.length===0 ? `<div class="empty" style="padding:24px 12px;"><p>Hazırda üzərində işlədiyin sifariş yoxdur.</p></div>`
        : mine.map(o=>courierOrderCardHTML(o)).join('')}

      <div class="sec-title">Yeni sifarişlər ${unassigned.length?`<span class="cnt">${unassigned.length}</span>`:''}</div>
      ${me.status!=='aktiv' ? `<div class="empty" style="padding:24px 12px;"><p>Yeni sifarişləri görmək üçün özünü <b>aktiv</b> et.</p></div>`
        : unassigned.length===0 ? `<div class="empty" style="padding:24px 12px;"><p>Hazırda yeni sifariş yoxdur.</p></div>`
        : unassigned.map(o=>courierOrderCardHTML(o,true)).join('')}

      ${history.length ? `
        <div class="sec-title">Son çatdırdıqların</div>
        ${history.map(o=>courierOrderCardHTML(o)).join('')}
      ` : ''}
    </div>
  `;
}
function courierOrderCardHTML(o, claimable){
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address);
  return `
    <div class="card" data-id="${o.id}">
      <div class="card-top">
        <div><div class="name">${escapeHTML(o.customerName)}</div><div class="sub">${escapeHTML(o.address)}</div></div>
        <div style="text-align:right;"><span class="badge ${o.status}">${STATUS_LABEL[o.status]}</span><div class="fee">${fmtMoney(o.courierFee)}</div></div>
      </div>
      <div class="card-meta"><span>📞 <span class="mono">${escapeHTML(o.phone||'—')}</span></span><span>${fmtDate(o.createdAt)}</span></div>
      ${o.notes ? `<div class="card-meta"><span>📝 ${escapeHTML(o.notes)}</span></div>` : ''}
      <div class="card-actions">
        ${claimable ? `<button class="btn btn-orange btn-sm" onclick="selfAssign('${o.id}')">Mənə təyin et</button>` : ''}
        ${(o.status==='tayin'||o.status==='yolda') ? `<a class="btn btn-ghost btn-sm" href="${mapsUrl}" target="_blank" rel="noopener">🧭 Naviqasiya</a>` : ''}
        ${o.status==='tayin' ? `<button class="btn btn-teal btn-sm" onclick="setOrderStatus('${o.id}','yolda')">Yolda kimi qeyd et</button>` : ''}
        ${o.status==='yolda' ? `<button class="btn btn-primary btn-sm" onclick="setOrderStatus('${o.id}','catdirildi')">Çatdırıldı kimi qeyd et</button>` : ''}
        ${(o.status==='tayin'||o.status==='yolda') ? `<button class="btn btn-ghost btn-sm" onclick="copyTrackingLink('${o.id}')">🔗 İzləmə linki</button>` : ''}
      </div>
    </div>
  `;
}
async function copyTrackingLink(orderId){
  const url = location.origin + '/izle.html?sifaris=' + orderId;
  try{
    await navigator.clipboard.writeText(url);
    toast('İzləmə linki kopyalandı — müştəriyə göndər');
  }catch(e){
    toast(url);
  }
}

/* ===================== COURIER: XƏRİTƏ ===================== */
function renderCourierMap(){
  const activeOrder = state.orders.find(o=>o.courierId===myCourierId && o.status==='yolda')
    || state.orders.find(o=>o.courierId===myCourierId && o.status==='tayin');
  return `
    <div class="view">
      <div class="sec-title">Canlı yerim</div>
      <div id="courierMapEl" style="width:100%;height:52vh;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#EEF0F4;"></div>
      <div class="card" style="margin-top:12px;">
        <div class="card-top">
          <div>
            <div class="name" style="font-size:14px;">Yer paylaşımı</div>
            <div class="sub">${activeOrder ? 'Müştəri səni xəritədə izləyə bilsin' : 'Paylaşmaq üçün aktiv sifarişin olmalıdır'}</div>
          </div>
          <span class="badge ${locationSharing?'aktiv':'passiv'}">${locationSharing?'Aktiv':'Passiv'}</span>
        </div>
        <div class="card-actions">
          <button class="btn ${locationSharing?'btn-danger':'btn-orange'} btn-sm" ${activeOrder?'':'disabled'} onclick="toggleLocationSharing()">
            ${locationSharing?'Paylaşımı dayandır':'Paylaşımı başlat'}
          </button>
        </div>
      </div>
    </div>
  `;
}
function initCourierMap(){
  const el = document.getElementById('courierMapEl');
  if(!el || typeof L === 'undefined') return;
  if(courierMap){ courierMap.remove(); courierMap = null; }
  courierMap = L.map(el, { attributionControl:false }).setView([40.4093, 49.8671], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(courierMap);
  L.control.attribution({ prefix:false }).addAttribution('© OpenStreetMap').addTo(courierMap);
  courierMarker = L.marker([40.4093, 49.8671]).addTo(courierMap);
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      courierMap.setView([latitude, longitude], 15);
      courierMarker.setLatLng([latitude, longitude]);
    }, ()=>{}, { enableHighAccuracy:true, timeout:8000 });
  }
}
function toggleLocationSharing(){
  if(locationSharing) stopLocationSharing(); else startLocationSharing();
}
function startLocationSharing(){
  const activeOrder = state.orders.find(o=>o.courierId===myCourierId && o.status==='yolda')
    || state.orders.find(o=>o.courierId===myCourierId && o.status==='tayin');
  if(!activeOrder){ toast('Paylaşmaq üçün aktiv sifarişin olmalıdır'); return; }
  if(!navigator.geolocation){ toast('Bu cihaz yer məlumatını dəstəkləmir'); return; }
  locationSharing = true;
  sendLocationUpdate(activeOrder.id);
  locationShareInterval = setInterval(()=>sendLocationUpdate(activeOrder.id), 12000);
  render();
}
function stopLocationSharing(){
  locationSharing = false;
  if(locationShareInterval){ clearInterval(locationShareInterval); locationShareInterval = null; }
  render();
}
function sendLocationUpdate(orderId){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async pos=>{
    const { latitude, longitude } = pos.coords;
    if(courierMap && courierMarker){ courierMap.setView([latitude, longitude]); courierMarker.setLatLng([latitude, longitude]); }
    try{
      await api('/api/orders/'+orderId+'/location', { method:'POST', body: JSON.stringify({ courierId: myCourierId, lat: latitude, lng: longitude }) });
    }catch(e){ /* səssiz saxla, növbəti cəhddə yenidən sınayacaq */ }
  }, ()=>{}, { enableHighAccuracy:true, timeout:8000 });
}
async function selfAssign(orderId){
  try{
    await api('/api/orders/'+orderId+'/assign', { method:'POST', body: JSON.stringify({ courierId: myCourierId }) });
    toast('Sifariş sənə təyin edildi');
    await fetchState();
  }catch(e){ toast(e.message); await fetchState(); }
}

/* ===================== MODALS ===================== */
function openModal(html){ modalOpen = true; document.getElementById('modalBody').innerHTML = html; document.getElementById('modalBg').classList.add('open'); }
function closeModal(){ modalOpen = false; document.getElementById('modalBg').classList.remove('open'); }
document.getElementById('modalBg').addEventListener('click', (e)=>{ if(e.target.id==='modalBg') closeModal(); });

function openOrderModal(){
  const couriers = state.couriers.filter(c=>c.status==='aktiv');
  openModal(`
    <button class="close-x" onclick="closeModal()">✕</button>
    <h2>Yeni sifariş</h2>
    <div class="field"><label>Müştəri adı *</label><input id="f-name" placeholder="Məs: Elçin Məmmədov"></div>
    <div class="field-row">
      <div class="field"><label>Telefon</label><input id="f-phone" placeholder="055 123 45 67"></div>
      <div class="field"><label>Çatdırılma haqqı (₼) *</label><input id="f-fee" type="number" inputmode="decimal" placeholder="5"></div>
    </div>
    <div class="field"><label>Ünvan *</label><input id="f-address" placeholder="Küçə, ev, rayon"></div>
    <div class="field-row">
      <div class="field"><label>Kuryerə ödəniş (₼)</label><input id="f-cfee" type="number" inputmode="decimal" placeholder="2"></div>
      <div class="field"><label>Kuryer təyin et</label>
        <select id="f-courier"><option value="">Kuryerlər özü götürsün</option>${couriers.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field"><label>Qeyd</label><textarea id="f-notes" placeholder="Əlavə qeyd (ixtiyari)"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">İmtina</button>
      <button class="btn btn-orange btn-block" id="submitOrderBtn" onclick="submitOrder()">Sifarişi əlavə et</button>
    </div>
  `);
}
async function submitOrder(){
  const name = document.getElementById('f-name').value.trim();
  const address = document.getElementById('f-address').value.trim();
  const fee = document.getElementById('f-fee').value;
  if(!name || !address || fee===''){ toast('Zəhmət olmasa müştəri adı, ünvan və haqqı doldur'); return; }
  const btn = document.getElementById('submitOrderBtn'); btn.disabled = true;
  try{
    await adminApi('/api/orders', { method:'POST', body: JSON.stringify({
      customerName: name,
      phone: document.getElementById('f-phone').value.trim(),
      address,
      fee: Number(fee)||0,
      courierFee: Number(document.getElementById('f-cfee').value)||0,
      notes: document.getElementById('f-notes').value.trim(),
      courierId: document.getElementById('f-courier').value || null
    })});
    closeModal();
    toast('Sifariş əlavə edildi');
    await fetchState();
    switchView('orders');
  }catch(e){ toast(e.message); btn.disabled = false; }
}

function openCourierModal(){
  openModal(`
    <button class="close-x" onclick="closeModal()">✕</button>
    <h2>Yeni kuryer</h2>
    <div class="field"><label>Ad, soyad *</label><input id="c-name" placeholder="Məs: Tural Əliyev"></div>
    <div class="field-row">
      <div class="field"><label>Telefon</label><input id="c-phone" placeholder="055 123 45 67"></div>
      <div class="field"><label>Nəqliyyat</label>
        <select id="c-vehicle"><option value="motosiklet">Motosiklet</option><option value="avtomobil">Avtomobil</option><option value="velosiped">Velosiped</option><option value="piyada">Piyada</option></select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">İmtina</button>
      <button class="btn btn-orange btn-block" id="submitCourierBtn" onclick="submitCourier()">Kuryeri əlavə et</button>
    </div>
  `);
}
async function submitCourier(){
  const name = document.getElementById('c-name').value.trim();
  if(!name){ toast('Zəhmət olmasa adı daxil et'); return; }
  const btn = document.getElementById('submitCourierBtn'); btn.disabled = true;
  try{
    await adminApi('/api/couriers', { method:'POST', body: JSON.stringify({
      name, phone: document.getElementById('c-phone').value.trim(), vehicle: document.getElementById('c-vehicle').value
    })});
    closeModal();
    toast('Kuryer əlavə edildi');
    await fetchState();
    switchView('couriers');
  }catch(e){ toast(e.message); btn.disabled = false; }
}

/* ===================== ACTIONS ===================== */
async function assignCourier(orderId){
  const sel = document.getElementById('sel-'+orderId);
  if(!sel || !sel.value) return;
  try{
    await api('/api/orders/'+orderId+'/assign', { method:'POST', body: JSON.stringify({ courierId: sel.value }) });
    toast('Sifariş kuryerə təyin edildi');
    await fetchState();
  }catch(e){ toast(e.message); await fetchState(); }
}
async function setOrderStatus(orderId, status){
  try{
    await api('/api/orders/'+orderId+'/status', { method:'POST', body: JSON.stringify({ status }) });
    const msgs = { yolda:'Sifariş yolda kimi qeyd edildi', catdirildi:'Sifariş çatdırıldı', legv:'Sifariş ləğv edildi' };
    toast(msgs[status] || 'Yeniləndi');
    await fetchState();
  }catch(e){ toast(e.message); }
}
async function deleteOrder(orderId){
  try{ await adminApi('/api/orders/'+orderId, { method:'DELETE' }); toast('Sifariş silindi'); await fetchState(); }
  catch(e){ toast(e.message); }
}
async function toggleCourierStatus(id){
  const c = courierById(id);
  const next = c.status==='aktiv' ? 'passiv' : 'aktiv';
  try{ await api('/api/couriers/'+id+'/status', { method:'POST', body: JSON.stringify({ status: next }) }); await fetchState(); }
  catch(e){ toast(e.message); }
}
async function deleteCourier(id){
  try{ await adminApi('/api/couriers/'+id, { method:'DELETE' }); toast('Kuryer silindi'); await fetchState(); }
  catch(e){ toast(e.message); }
}

/* ===================== INIT ===================== */
(function init(){
  if((role==='admin' && adminToken) || (role==='courier' && myCourierId)){
    startApp();
  }else if(window.ENTRY_MODE==='admin'){
    showAdminLogin();
  }else if(window.ENTRY_MODE==='courier'){
    showCourierPick();
  }else{
    showGate();
  }
})();
