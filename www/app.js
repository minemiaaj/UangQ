'use strict';

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
});
const $ = (id) => document.getElementById(id);
const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const pad2 = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; // tanggal lokal (bukan UTC)
const today = () => localISO(new Date());

const cap = window.Capacitor;
const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const isElectron = !!window.uangq;
const REDIRECT = isNative ? 'com.uangq.app://auth' : isElectron ? 'uangq://auth' : location.origin + location.pathname;

const IDLE_MS = 120000;   // kunci otomatis setelah 2 menit tanpa aktivitas
const BG_MS = 30000;      // kunci jika aplikasi di latar belakang > 30 detik

let items = [], channel = null, unlocked = false, enrollFactor = null, idleT = null, hiddenAt = 0;

function show(name) { document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-' + name; }); }
function say(id, text, bad = true) { const el = $(id); el.textContent = text; el.className = bad ? 'msg bad' : 'msg'; }
const errText = (e) => (e && e.message) || String(e);

/* ---------- 1. Login Google (OAuth PKCE) ---------- */
async function loginGoogle() {
  say('authMsg', 'Membuka Google...', false);
  const { data, error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } }
  });
  if (error) return say('authMsg', error.message);
  try {
    if (isNative) await cap.Plugins.Browser.open({ url: data.url });
    else if (isElectron) await window.uangq.openExternal(data.url);
    else location.assign(data.url);
  } catch (e) { say('authMsg', errText(e)); }
}

async function handleAuthUrl(url) {
  try {
    const u = new URL(url);
    const err = u.searchParams.get('error_description');
    if (err) throw new Error(err);
    const code = u.searchParams.get('code');
    if (!code) throw new Error('Kode login tidak ditemukan.');
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) throw error;
    try { await cap.Plugins.Browser.close(); } catch (_) { /* abaikan */ }
  } catch (e) { show('auth'); say('authMsg', errText(e)); }
}

/* ---------- 2. Verifikasi 2 langkah (TOTP) ---------- */
async function startEnroll() {
  show('mfaEnroll');
  $('qr').removeAttribute('src'); $('secret').textContent = '';
  say('enrollMsg', 'Menyiapkan...', false);
  const { data: lf } = await db.auth.mfa.listFactors();
  for (const f of (lf && lf.all) || []) if (f.status === 'unverified') await db.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'UangQ-' + Date.now() });
  if (error) return say('enrollMsg', error.message);
  enrollFactor = data.id;
  $('qr').src = data.totp.qr_code;
  $('secret').textContent = data.totp.secret;
  say('enrollMsg', '', false);
}

async function verifyEnroll() {
  const code = $('enrollCode').value.trim();
  if (!/^\d{6}$/.test(code)) return say('enrollMsg', 'Kode harus 6 digit.');
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: enrollFactor, code });
  if (error) return say('enrollMsg', 'Kode salah atau kedaluwarsa. Coba lagi.');
  $('enrollCode').value = '';
  await gate();
}

async function verifyMfa() {
  const code = $('mfaCode').value.trim();
  if (!/^\d{6}$/.test(code)) return say('mfaMsg', 'Kode harus 6 digit.');
  const { data: lf, error: e1 } = await db.auth.mfa.listFactors();
  if (e1 || !lf.totp.length) return say('mfaMsg', 'Faktor autentikator tidak ditemukan.');
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: lf.totp[0].id, code });
  if (error) return say('mfaMsg', 'Kode salah atau kedaluwarsa. Coba lagi.');
  $('mfaCode').value = '';
  await gate();
}

/* ---------- 3. PIN & kunci otomatis ---------- */
async function currentUid() { const { data } = await db.auth.getSession(); return data.session && data.session.user.id; }

async function setPin() {
  const a = $('pin1').value, b = $('pin2').value;
  if (!/^\d{6}$/.test(a)) return say('pinSetMsg', 'PIN harus 6 digit angka.');
  if (/^(\d)\1{5}$/.test(a) || a === '123456' || a === '654321') return say('pinSetMsg', 'PIN terlalu mudah ditebak.');
  if (a !== b) return say('pinSetMsg', 'PIN tidak sama.');
  await Lock.set(await currentUid(), a);
  $('pin1').value = $('pin2').value = '';
  unlocked = true;
  await gate();
}

async function unlock() {
  const uid = await currentUid();
  const r = await Lock.verify(uid, $('pinIn').value);
  $('pinIn').value = '';
  if (r.ok) { say('unlockMsg', '', false); unlocked = true; return gate(); }
  if (r.wipe) { Lock.clear(uid); say('unlockMsg', 'Terlalu banyak percobaan. Silakan masuk ulang.'); return signOut(); }
  if (r.wait) return say('unlockMsg', `Terlalu banyak percobaan. Tunggu ${r.wait} detik.`);
  say('unlockMsg', `PIN salah. Sisa percobaan sebelum dijeda: ${r.left}.`);
}

async function forgotPin() {
  if (!confirm('Keluar dan reset PIN di perangkat ini? Anda perlu login Google + kode 2 langkah lagi.')) return;
  const uid = await currentUid();
  if (uid) Lock.clear(uid);
  await signOut();
}

function bump() { clearTimeout(idleT); if (unlocked) idleT = setTimeout(lockNow, IDLE_MS); }
function lockNow() { unlocked = false; clearTimeout(idleT); gate(); }
['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((e) => addEventListener(e, bump, { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (unlocked && Date.now() - hiddenAt > BG_MS) lockNow();
});

async function signOut() { unlocked = false; await db.auth.signOut(); }

/* ---------- Gerbang: urutan layar yang wajib dilewati ---------- */
let gq = Promise.resolve();
const gate = () => (gq = gq.then(_gate).catch((e) => console.error(e)));

async function _gate() {
  const { data: { session: s } } = await db.auth.getSession();
  if (!s) { unlocked = false; leaveApp(); show('auth'); return; }

  const { data: aal, error } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) { leaveApp(); show('auth'); say('authMsg', error.message); return; }
  if (aal.currentLevel !== 'aal2') {
    unlocked = false; leaveApp();
    if (aal.nextLevel === 'aal2') { show('mfaChallenge'); $('mfaCode').focus(); }
    else if ($('screen-mfaEnroll').hidden) await startEnroll();
    return;
  }

  const uid = s.user.id;
  if (!Lock.has(uid)) { unlocked = false; leaveApp(); show('pinSetup'); return; }
  if (!unlocked) { leaveApp(); show('pinUnlock'); return; }
  if ($('screen-app').hidden) enterApp(s);
}

function enterApp(s) {
  show('app');
  const meta = s.user.user_metadata || {};
  const name = String(meta.full_name || meta.name || (s.user.email || '').split('@')[0] || '').split(' ')[0];
  $('greet').textContent = `${greeting()}, ${name}`;
  $('setEmail').textContent = s.user.email || '';
  $('date').value = today();
  switchTab('home');
  load(); Accounts.load(); subscribe(); bump();
  if (window.Theme) Theme.refreshRemote();
}

function leaveApp() {
  items = [];
  closeSheet(); Accounts.leave();
  ['recentList', 'txList', 'catList', 'spark'].forEach((id) => $(id).replaceChildren());
  ['sumIn', 'sumOut', 'balance'].forEach((id) => { $(id).textContent = 'Rp0'; $(id).dataset.v = 0; });
  if (channel) { db.removeChannel(channel); channel = null; }
}

/* ---------- Data & tampilan ---------- */
const DEFAULT_CATS = ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Gaji', 'Lainnya'];
let curMonth = today().slice(0, 7), txFilter = 'all', txQuery = '', sheetType = 'expense';

const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; };
const motionOff = () => (window.FX ? FX.mode() === 'off' : matchMedia('(prefers-reduced-motion: reduce)').matches);
const hue = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(y, mo - 1, 1)); };

function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'i');
  const use = document.createElementNS(NS, 'use'); use.setAttribute('href', '#i-' + name);
  svg.append(use); return svg;
}

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

function dayLabel(d) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d === today()) return 'Hari ini';
  if (d === localISO(y)) return 'Kemarin';
  const [Y, M, D] = d.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(Y, M - 1, D));
}

function countTo(el, to) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (motionOff() || from === to) { el.textContent = rupiah(to); return; }
  const t0 = performance.now(), dur = 650;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = rupiah(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + name; });
  document.querySelectorAll('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('monthbar').hidden = name === 'settings' || name === 'acc';
  scrollTo(0, 0);
}

function monthRange(m) {
  const [y, mo] = m.split('-').map(Number);
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  return [`${m}-01`, next];
}

function shiftMonth(d) {
  const [y, mo] = curMonth.split('-').map(Number);
  curMonth = localISO(new Date(y, mo - 1 + d, 1)).slice(0, 7);
  load();
}

const loadTx = () => load();
async function load() {
  $('monthLabel').textContent = monthLabel(curMonth);
  const [from, to] = monthRange(curMonth);
  const { data, error } = await db.from('transactions').select('*')
    .gte('date', from).lt('date', to)
    .order('date', { ascending: false }).order('created_at', { ascending: false });
  if (error) return toast('Gagal memuat: ' + error.message);
  items = data;
  renderHome(); renderTx();
}

function emptyLi(text) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; return li; }

function txRow(t, canDelete, i) {
  const li = document.createElement('li'); li.className = 'txrow';
  li.style.setProperty('--d', Math.min(i, 12) * 30 + 'ms');
  const av = document.createElement('span'); av.className = 'avatar';
  av.textContent = (t.category[0] || '?').toUpperCase(); av.style.setProperty('--h', hue(t.category));
  const main = document.createElement('div'); main.className = 'tx-main';
  const cat = document.createElement('strong'); cat.textContent = t.category;
  const meta = document.createElement('small'); meta.textContent = [Accounts.label(t.account_id), t.note || t.date].filter(Boolean).join(' · ');
  main.append(cat, meta);
  const amt = document.createElement('span'); amt.className = 'tx-amt ' + t.type;
  amt.textContent = (t.type === 'income' ? '+' : '−') + rupiah(Number(t.amount));
  li.append(av, main, amt);
  if (canDelete) {
    const del = document.createElement('button'); del.className = 'iconbtn';
    del.title = 'Hapus'; del.setAttribute('aria-label', 'Hapus transaksi');
    del.append(icon('trash')); del.onclick = () => remove(t.id);
    li.append(del);
  } else li.style.setProperty('grid-template-columns', '42px 1fr auto');
  return li;
}

function drawSpark(daily) {
  const svg = $('spark'); svg.replaceChildren();
  const W = 300, H = 80, P = 4, n = daily.length;
  if (n < 2) return;
  const min = Math.min(0, ...daily), max = Math.max(0, ...daily), rng = (max - min) || 1;
  const pts = daily.map((v, i) => [P + i * (W - 2 * P) / (n - 1), H - P - (v - min) / rng * (H - 2 * P)]);
  const NS = 'http://www.w3.org/2000/svg';
  const area = document.createElementNS(NS, 'polygon'); area.setAttribute('class', 'spark-area');
  area.setAttribute('points', pts.map((p) => p.join(',')).join(' ') + ` ${W - P},${H - P} ${P},${H - P}`);
  const line = document.createElementNS(NS, 'polyline'); line.setAttribute('class', 'spark-line');
  line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  svg.append(area, line);
}

function renderHome() {
  let inc = 0, exp = 0;
  const byCat = new Map(), perDay = new Map();
  for (const t of items) {
    const a = Number(t.amount);
    if (t.type === 'income') inc += a; else { exp += a; byCat.set(t.category, (byCat.get(t.category) || 0) + a); }
    perDay.set(t.date, (perDay.get(t.date) || 0) + (t.type === 'income' ? a : -a));
  }
  countTo($('sumIn'), inc); countTo($('sumOut'), exp); countTo($('balance'), inc - exp);
  $('balance').className = 'balance ' + (inc - exp >= 0 ? 'pos' : 'neg');
  $('saveRate').textContent = inc > 0
    ? (inc >= exp ? `Menabung ${Math.round((inc - exp) / inc * 100)}% dari pemasukan` : `Pengeluaran melebihi pemasukan ${rupiah(exp - inc)}`)
    : (exp > 0 ? 'Belum ada pemasukan bulan ini' : 'Belum ada transaksi bulan ini');

  const [y, m] = curMonth.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate(), now = new Date();
  const upto = now.getFullYear() === y && now.getMonth() === m - 1 ? now.getDate() : dim;
  let cum = 0; const daily = [0];
  for (let d = 1; d <= upto; d++) { cum += perDay.get(`${curMonth}-${String(d).padStart(2, '0')}`) || 0; daily.push(cum); }
  drawSpark(daily);

  const cl = $('catList'); cl.replaceChildren();
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!top.length) { const p = document.createElement('p'); p.className = 'dim'; p.textContent = 'Belum ada pengeluaran.'; cl.append(p); }
  for (const [name, val] of top) {
    const row = document.createElement('div'); row.className = 'catrow';
    const head = document.createElement('div'); head.className = 'top';
    const l = document.createElement('span'); l.textContent = name;
    const r = document.createElement('span'); r.className = 'dim'; r.textContent = `${rupiah(val)} · ${Math.round(val / exp * 100)}%`;
    head.append(l, r);
    const bar = document.createElement('span'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.setProperty('--w', Math.max(3, val / exp * 100) + '%'); fill.style.setProperty('--h', hue(name));
    bar.append(fill); row.append(head, bar); cl.append(row);
  }

  const rl = $('recentList'); rl.replaceChildren();
  if (!items.length) rl.append(emptyLi('Belum ada transaksi bulan ini.'));
  items.slice(0, 5).forEach((t, i) => rl.append(txRow(t, false, i)));
}

function renderTx() {
  const q = txQuery.trim().toLowerCase();
  const list = items.filter((t) => (txFilter === 'all' || t.type === txFilter) &&
    (!q || t.category.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q)));
  const ul = $('txList'); ul.replaceChildren();
  if (!list.length) { ul.append(emptyLi('Tidak ada transaksi.')); return; }
  const groups = new Map();
  for (const t of list) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  let i = 0;
  for (const [date, arr] of groups) {
    const net = arr.reduce((s, t) => s + (t.type === 'income' ? 1 : -1) * Number(t.amount), 0);
    const h = document.createElement('li'); h.className = 'day';
    const a = document.createElement('span'); a.textContent = dayLabel(date);
    const b = document.createElement('span'); b.textContent = (net >= 0 ? '+' : '−') + rupiah(Math.abs(net));
    h.append(a, b); ul.append(h);
    arr.forEach((t) => ul.append(txRow(t, true, i++)));
  }
}

/* ---------- Lembar tambah transaksi ---------- */
function setSheetType(type) {
  sheetType = type;
  document.querySelectorAll('#typeSeg .seg').forEach((b) => b.classList.toggle('on', b.dataset.type === type));
}

function buildChips() {
  const names = [...new Set([...items.filter((t) => t.type === sheetType).map((t) => t.category), ...DEFAULT_CATS])].slice(0, 8);
  const box = $('catChips'); box.replaceChildren();
  $('cats').replaceChildren();
  for (const n of names) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = n;
    c.onclick = () => { $('category').value = n; box.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); };
    box.append(c);
    const o = document.createElement('option'); o.value = n; $('cats').append(o);
  }
}

function openSheet() {
  $('sheet').hidden = false; setSheetType(sheetType); buildChips(); say('msg', '', false);
  requestAnimationFrame(() => $('sheet').classList.add('open'));
  setTimeout(() => $('amount').focus(), 200);
}

function closeSheet() {
  const s = $('sheet'); if (s.hidden) return;
  s.classList.remove('open'); setTimeout(() => { s.hidden = true; }, 230);
}

async function add() {
  const amount = Number($('amount').value);
  const category = $('category').value.trim();
  if (!(amount > 0) || !category) return say('msg', 'Isi jumlah (> 0) dan kategori.');
  const { error } = await db.from('transactions').insert({
    type: sheetType, amount, category, account_id: $('txAccount').value || null,
    note: $('note').value.trim() || null,
    date: $('date').value || today()
  });
  if (error) return say('msg', 'Gagal menyimpan: ' + error.message);
  if (window.FX) { const r = $('btnAdd').getBoundingClientRect(); FX.celebrate(r.left + r.width / 2, r.top); }
  $('amount').value = ''; $('note').value = ''; $('category').value = '';
  closeSheet(); toast('Tersimpan ✓');
  load(); Accounts.load();
}

async function remove(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) toast('Gagal menghapus: ' + error.message); else load();
}

async function changePin() {
  if (!confirm('Ganti PIN? Anda akan diminta membuat PIN baru.')) return;
  const uid = await currentUid();
  if (uid) Lock.clear(uid);
  unlocked = false; gate();
}

function subscribe() {
  if (channel) return;
  channel = db.channel('tx-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { load(); Accounts.load(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => Accounts.load())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, () => Accounts.load())
    .subscribe();
}

/* ---------- Event & start ---------- */
$('btnGoogle').onclick = loginGoogle;
$('btnEnroll').onclick = verifyEnroll;
$('btnMfa').onclick = verifyMfa;
$('btnPinSet').onclick = setPin;
$('btnUnlock').onclick = unlock;
$('btnForgot').onclick = forgotPin;
$('btnLock').onclick = lockNow;
$('btnAdd').onclick = add;
document.querySelectorAll('.navbtn').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
$('prevMonth').onclick = () => shiftMonth(-1);
$('nextMonth').onclick = () => shiftMonth(1);
$('fab').onclick = openSheet;
$('btnCloseSheet').onclick = closeSheet;
$('sheetBackdrop').onclick = closeSheet;
document.querySelectorAll('#typeSeg .seg').forEach((b) => { b.onclick = () => { setSheetType(b.dataset.type); buildChips(); }; });
document.querySelectorAll('#filterSeg .seg').forEach((b) => {
  b.onclick = () => { txFilter = b.dataset.f; document.querySelectorAll('#filterSeg .seg').forEach((x) => x.classList.toggle('on', x === b)); renderTx(); };
});
$('txSearch').oninput = (e) => { txQuery = e.target.value; renderTx(); };
$('linkAll').onclick = () => switchTab('tx');
$('btnChangePin').onclick = changePin;
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); Accounts.closeAll(); } });
Accounts.init();
document.querySelectorAll('.btnOut').forEach((b) => { b.onclick = signOut; });
$('pinIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
$('mfaCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyMfa(); });
$('enrollCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyEnroll(); });

if (isNative) cap.Plugins.App.addListener('appUrlOpen', (e) => handleAuthUrl(e.url));
if (isElectron) window.uangq.onAuthCallback(handleAuthUrl);
if (!isNative && !isElectron && new URLSearchParams(location.search).has('code')) {
  handleAuthUrl(location.href).then(() => history.replaceState(null, '', location.pathname));
}

db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') unlocked = false;
  if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'MFA_CHALLENGE_VERIFIED'].includes(event)) setTimeout(gate, 0);
});

if (CONFIG.SUPABASE_URL.includes('GANTI')) {
  show('auth'); say('authMsg', 'Isi dulu SUPABASE_URL dan SUPABASE_ANON_KEY di www/config.js.');
} else {
  gate();
}
