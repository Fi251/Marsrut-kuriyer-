/* Marşrut — Kuryer İdarəetmə Serveri
   Sadə, asılılıqsız Node.js server. Yalnız "node server.js" ilə işə düşür.
   Bütün data data.json faylında saxlanılır. Şəbəkədəki bütün cihazlar
   bu serverin IP-si üzərindən eyni məlumatı görür. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
// DATA_DIR env dəyişəni ilə datanı sabit diskdə saxlamaq mümkündür
// (məs. Render-də persistent disk qoşulanda: DATA_DIR=/var/data)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// İdarəçi panelinin şifrəsi. Render-də Environment Variable olaraq
// ADMIN_PASSWORD təyin etsən, oradakı dəyər işləyəcək. Təyin etməsən,
// aşağıdakı standart şifrə istifadə olunur.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'marsrut2026';
const validTokens = new Set();
function isAdmin(req){
  const token = req.headers['x-admin-token'];
  return !!token && validTokens.has(token);
}

/* ---------- Data qatı ---------- */
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { orders: [], couriers: [] };
  }
}
function saveData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
let db = loadData();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Kömək funksiyaları ---------- */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, decodeURIComponent(filePath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // SPA fallback -> index.html
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, idx) => {
        if (err2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

/* ---------- API ---------- */
async function handleAPI(req, res, pathname) {
  const method = req.method;

  if (method === 'GET' && pathname === '/api/state') {
    return sendJSON(res, 200, db);
  }

  if (method === 'POST' && pathname === '/api/admin-login') {
    const b = await readBody(req);
    if (String(b.password || '') !== ADMIN_PASSWORD) {
      return sendJSON(res, 401, { error: 'Şifrə yanlışdır' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    validTokens.add(token);
    return sendJSON(res, 200, { token });
  }

  if (method === 'POST' && pathname === '/api/orders') {
    if (!isAdmin(req)) return sendJSON(res, 401, { error: 'İdarəçi girişi lazımdır' });
    const b = await readBody(req);
    if (!b.customerName || !b.address || b.fee === undefined) {
      return sendJSON(res, 400, { error: 'customerName, address, fee tələb olunur' });
    }
    const order = {
      id: uid(),
      customerName: String(b.customerName).slice(0, 200),
      phone: String(b.phone || '').slice(0, 60),
      address: String(b.address).slice(0, 300),
      fee: Number(b.fee) || 0,
      courierFee: Number(b.courierFee) || 0,
      notes: String(b.notes || '').slice(0, 500),
      courierId: b.courierId || null,
      status: b.courierId ? 'tayin' : 'yeni',
      createdAt: Date.now()
    };
    db.orders.push(order);
    saveData(db);
    return sendJSON(res, 201, order);
  }

  let m;
  if (method === 'POST' && (m = pathname.match(/^\/api\/orders\/([^/]+)\/assign$/))) {
    const b = await readBody(req);
    const o = db.orders.find(x => x.id === m[1]);
    if (!o) return sendJSON(res, 404, { error: 'Sifariş tapılmadı' });
    if (!b.courierId || !db.couriers.find(c => c.id === b.courierId)) {
      return sendJSON(res, 400, { error: 'Kuryer tapılmadı' });
    }
    if (o.status !== 'yeni') return sendJSON(res, 409, { error: 'Bu sifariş artıq təyin edilib' });
    o.courierId = b.courierId;
    o.status = 'tayin';
    saveData(db);
    return sendJSON(res, 200, o);
  }

  if (method === 'POST' && (m = pathname.match(/^\/api\/orders\/([^/]+)\/status$/))) {
    const b = await readBody(req);
    const o = db.orders.find(x => x.id === m[1]);
    if (!o) return sendJSON(res, 404, { error: 'Sifariş tapılmadı' });
    const allowed = ['yeni', 'tayin', 'yolda', 'catdirildi', 'legv'];
    if (!allowed.includes(b.status)) return sendJSON(res, 400, { error: 'Yanlış status' });
    o.status = b.status;
    saveData(db);
    return sendJSON(res, 200, o);
  }

  if (method === 'DELETE' && (m = pathname.match(/^\/api\/orders\/([^/]+)$/))) {
    if (!isAdmin(req)) return sendJSON(res, 401, { error: 'İdarəçi girişi lazımdır' });
    const before = db.orders.length;
    db.orders = db.orders.filter(x => x.id !== m[1]);
    if (db.orders.length === before) return sendJSON(res, 404, { error: 'Sifariş tapılmadı' });
    saveData(db);
    return sendJSON(res, 200, { ok: true });
  }

  // Kuryer öz canlı yerini paylaşır (yalnız özünə təyin olunmuş sifariş üçün)
  if (method === 'POST' && (m = pathname.match(/^\/api\/orders\/([^/]+)\/location$/))) {
    const b = await readBody(req);
    const o = db.orders.find(x => x.id === m[1]);
    if (!o) return sendJSON(res, 404, { error: 'Sifariş tapılmadı' });
    if (!b.courierId || o.courierId !== b.courierId) {
      return sendJSON(res, 403, { error: 'Bu sifariş sənə təyin edilməyib' });
    }
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!isFinite(lat) || !isFinite(lng)) return sendJSON(res, 400, { error: 'Yanlış koordinat' });
    o.courierLocation = { lat, lng, updatedAt: Date.now() };
    saveData(db);
    return sendJSON(res, 200, { ok: true });
  }

  // Müştəri izləmə səhifəsi üçün açıq, məhdud məlumat (giriş tələb olunmur)
  if (method === 'GET' && (m = pathname.match(/^\/api\/track\/([^/]+)$/))) {
    const o = db.orders.find(x => x.id === m[1]);
    if (!o) return sendJSON(res, 404, { error: 'Sifariş tapılmadı' });
    const c = o.courierId ? db.couriers.find(x => x.id === o.courierId) : null;
    return sendJSON(res, 200, {
      id: o.id,
      customerName: o.customerName,
      address: o.address,
      status: o.status,
      createdAt: o.createdAt,
      courierName: c ? c.name : null,
      courierPhone: c ? c.phone : null,
      courierVehicle: c ? c.vehicle : null,
      courierLocation: (o.status === 'yolda' && o.courierLocation) ? o.courierLocation : null
    });
  }

  if (method === 'POST' && pathname === '/api/couriers') {
    if (!isAdmin(req)) return sendJSON(res, 401, { error: 'İdarəçi girişi lazımdır' });
    const b = await readBody(req);
    if (!b.name) return sendJSON(res, 400, { error: 'Ad tələb olunur' });
    const courier = {
      id: uid(),
      name: String(b.name).slice(0, 120),
      phone: String(b.phone || '').slice(0, 60),
      vehicle: ['motosiklet', 'avtomobil', 'velosiped', 'piyada'].includes(b.vehicle) ? b.vehicle : 'motosiklet',
      status: 'aktiv',
      createdAt: Date.now()
    };
    db.couriers.push(courier);
    saveData(db);
    return sendJSON(res, 201, courier);
  }

  if (method === 'POST' && (m = pathname.match(/^\/api\/couriers\/([^/]+)\/status$/))) {
    const b = await readBody(req);
    const c = db.couriers.find(x => x.id === m[1]);
    if (!c) return sendJSON(res, 404, { error: 'Kuryer tapılmadı' });
    if (!['aktiv', 'passiv'].includes(b.status)) return sendJSON(res, 400, { error: 'Yanlış status' });
    c.status = b.status;
    saveData(db);
    return sendJSON(res, 200, c);
  }

  if (method === 'DELETE' && (m = pathname.match(/^\/api\/couriers\/([^/]+)$/))) {
    if (!isAdmin(req)) return sendJSON(res, 401, { error: 'İdarəçi girişi lazımdır' });
    const hasActive = db.orders.some(o => o.courierId === m[1] && (o.status === 'tayin' || o.status === 'yolda'));
    if (hasActive) return sendJSON(res, 409, { error: 'Bu kuryerin aktiv sifarişi var' });
    const before = db.couriers.length;
    db.couriers = db.couriers.filter(x => x.id !== m[1]);
    if (db.couriers.length === before) return sendJSON(res, 404, { error: 'Kuryer tapılmadı' });
    saveData(db);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: 'Bilinməyən endpoint' });
}

/* ---------- Server ---------- */
const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];
  try {
    if (pathname.startsWith('/api/')) {
      await handleAPI(req, res, pathname);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (e) {
    sendJSON(res, 500, { error: 'Server xətası: ' + e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log('');
  console.log('  Marşrut serveri işə düşdü ✅');
  console.log('  ------------------------------------');
  console.log('  Bu cihazda: http://localhost:' + PORT);
  if (ips.length) {
    ips.forEach(ip => console.log('  Şəbəkədə:   http://' + ip + ':' + PORT));
    console.log('');
    console.log('  Kuryerlər eyni Wi-Fi-a qoşulub yuxarıdakı');
    console.log('  "Şəbəkədə" linkini telefon brauzerində açsın.');
  } else {
    console.log('  Şəbəkə IP-si tapılmadı — Wi-Fi bağlantısını yoxla.');
  }
  console.log('  ------------------------------------');
  console.log('');
});
