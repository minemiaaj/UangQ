'use strict';
// Rekening bank / dompet digital / tunai: saldo, transfer antar rekening, impor mutasi CSV.
// Aplikasi TIDAK menyimpan nomor rekening lengkap, hanya 4 digit terakhir (opsional).
const Accounts = (() => {
  const PROVIDERS = {
    bank: ['Bank Sultra', 'BRI', 'BNI', 'Mandiri', 'BCA', 'BSI', 'BTN', 'CIMB Niaga', 'Muamalat', 'Danamon', 'Permata', 'Panin', 'SeaBank', 'Jago', 'Lainnya'],
    ewallet: ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja', 'Lainnya'],
    cash: ['Tunai']
  };
  const KIND_LABEL = { bank: 'Bank', ewallet: 'Dompet digital', cash: 'Tunai' };
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
  const SHEETS = ['accSheet', 'trSheet', 'csvSheet'];
  const el = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const norm = (s) => String(s == null ? '' : s).trim();

  let all = [], transfers = [], kind = 'bank', csv = null, mode = 'single';
  const map = { date: -1, desc: -1, amt: -1, debit: -1, credit: -1 };
  const active = () => all.filter((a) => !a.archived);
  const byId = (id) => all.find((a) => a.id === id);
  const optLabel = (a) => `${a.name} · ${a.provider}${a.last4 ? ' ••' + a.last4 : ''}`;
  const label = (id) => { const a = byId(id); return a ? a.name : ''; };

  /* ---------- parser (diuji terpisah) ---------- */
  function detectDelim(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
    const cnt = (d) => lines.reduce((s, l) => s + (l.split(d).length - 1), 0);
    return [[',', cnt(',')], [';', cnt(';')], ['\t', cnt('\t')]].sort((a, b) => b[1] - a[1])[0][0];
  }
  function parseCsv(text, delim) {
    const rows = []; let row = [], cell = '', q = false;
    const endRow = () => { row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; };
    for (let i = 0; i < text.length && rows.length <= 5000; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cell += ch;
    }
    if (cell !== '' || row.length) endRow();
    return rows;
  }
  function parseAmount(raw) {
    let s = norm(raw); if (!s) return null;
    let neg = false;
    if (/\bDB\b|DEBIT|DEBET/i.test(s)) neg = true;
    if (/\bCR\b|KREDIT|CREDIT/i.test(s)) neg = false;
    if (/^\(.*\)$/.test(s)) neg = true;
    s = s.replace(/[^0-9.,\-]/g, '');
    if (s.startsWith('-')) neg = true;
    s = s.replace(/-/g, '');
    if (!/\d/.test(s)) return null;
    const lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(','), last = Math.max(lastDot, lastCom);
    let decimal = -1;
    if (last >= 0) {
      const occ = s.split(s[last]).length - 1, after = s.length - last - 1;
      if (lastDot >= 0 && lastCom >= 0) decimal = last;
      else if (occ === 1 && after >= 1 && after <= 2) decimal = last;
    }
    const digits = decimal >= 0 ? s.slice(0, decimal).replace(/[.,]/g, '') + '.' + s.slice(decimal + 1).replace(/[.,]/g, '') : s.replace(/[.,]/g, '');
    const n = Number(digits);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }
  const isoDate = (y, mo, d) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d); if (dt.getMonth() !== mo - 1) return null;
    return `${y}-${p2(mo)}-${p2(d)}`;
  };
  function parseDate(raw) {
    const s = norm(raw); let m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return isoDate(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return isoDate(y, +m[2], +m[1]); }
    if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,.-]+(\d{2,4})/))) {
      const mo = MON[m[2].slice(0, 3).toLowerCase()]; let y = +m[3]; if (y < 100) y += 2000;
      return mo ? isoDate(y, mo, +m[1]) : null;
    }
    return null;
  }
  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- sheet ---------- */
  function openS(id) { const s = el(id); s.hidden = false; requestAnimationFrame(() => s.classList.add('open')); }
  function closeS(id) { const s = el(id); if (s.hidden) return; s.classList.remove('open'); setTimeout(() => { s.hidden = true; }, 230); }
  const closeAll = () => SHEETS.forEach(closeS);

  /* ---------- data ---------- */
  function fillSelect(sel, withNone) {
    const cur = sel.value; sel.replaceChildren();
    if (withNone) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Tanpa rekening'; sel.append(o); }
    for (const a of active()) { const o = document.createElement('option'); o.value = a.id; o.textContent = optLabel(a); sel.append(o); }
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }
  function fillSelects() {
    fillSelect(el('txAccount'), true); fillSelect(el('trFrom')); fillSelect(el('trTo')); fillSelect(el('csvAcc'));
    if (el('trTo').options.length > 1 && el('trTo').value === el('trFrom').value) el('trTo').selectedIndex = 1;
  }

  async function load() {
    const [a, b, t] = await Promise.all([
      db.from('accounts').select('*').order('created_at'),
      db.from('account_balances').select('id,balance'),
      db.from('transfers').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(30)
    ]);
    const err = a.error || b.error || t.error;
    if (err) return toast(/does not exist|schema cache/i.test(err.message) ? 'Jalankan ulang supabase/schema.sql di Supabase.' : 'Gagal memuat rekening: ' + err.message);
    const bal = new Map(b.data.map((x) => [x.id, Number(x.balance)]));
    all = a.data.map((x) => ({ ...x, balance: bal.has(x.id) ? bal.get(x.id) : Number(x.opening_balance) }));
    transfers = t.data;
    render(); fillSelects();
    if (typeof renderHome === 'function') { renderHome(); renderTx(); }
  }

  function leave() {
    all = []; transfers = []; csv = null; closeAll();
    ['accList', 'trList'].forEach((id) => el(id).replaceChildren());
    el('accTotal').textContent = 'Rp0'; el('accTotal').dataset.v = 0;
  }

  /* ---------- tampilan ---------- */
  function accCard(a) {
    const d = document.createElement('div'); d.className = 'card acc';
    const av = document.createElement('span'); av.className = 'avatar'; av.textContent = (a.provider[0] || '?').toUpperCase(); av.style.setProperty('--h', hue(a.provider));
    const main = document.createElement('div'); main.className = 'tx-main';
    const n = document.createElement('strong'); n.textContent = a.name;
    const m = document.createElement('small'); m.textContent = `${a.provider} · ${KIND_LABEL[a.kind]}${a.last4 ? ' · ••' + a.last4 : ''}`;
    main.append(n, m);
    const amt = document.createElement('span'); amt.className = 'tx-amt ' + (a.balance >= 0 ? 'income' : 'expense'); amt.textContent = rupiah(a.balance);
    const del = document.createElement('button'); del.className = 'iconbtn'; del.title = 'Arsipkan'; del.setAttribute('aria-label', 'Arsipkan rekening');
    del.append(icon('trash')); del.onclick = () => archive(a.id);
    d.append(av, main, amt, del);
    return d;
  }

  function render() {
    countTo(el('accTotal'), active().reduce((s, a) => s + a.balance, 0));
    const box = el('accList'); box.replaceChildren();
    if (!active().length) { const p = document.createElement('div'); p.className = 'card empty'; p.textContent = 'Belum ada rekening. Tambahkan bank, dompet digital, atau tunai.'; box.append(p); }
    active().forEach((a) => box.append(accCard(a)));

    const ul = el('trList'); ul.replaceChildren();
    if (!transfers.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Belum ada transfer.'; ul.append(li); }
    transfers.forEach((t, i) => {
      const li = document.createElement('li'); li.className = 'txrow'; li.style.setProperty('--d', Math.min(i, 12) * 30 + 'ms');
      const av = document.createElement('span'); av.className = 'avatar'; av.textContent = '⇄'; av.style.setProperty('--h', 200);
      const main = document.createElement('div'); main.className = 'tx-main';
      const s = document.createElement('strong'); s.textContent = `${label(t.from_account) || '?'} → ${label(t.to_account) || '?'}`;
      const sm = document.createElement('small'); sm.textContent = t.date + (t.note ? ' · ' + t.note : '');
      main.append(s, sm);
      const amt = document.createElement('span'); amt.className = 'tx-amt'; amt.textContent = rupiah(Number(t.amount));
      const del = document.createElement('button'); del.className = 'iconbtn'; del.title = 'Batalkan transfer'; del.setAttribute('aria-label', 'Batalkan transfer');
      del.append(icon('trash')); del.onclick = () => delTransfer(t.id);
      li.append(av, main, amt, del); ul.append(li);
    });
  }

  /* ---------- rekening ---------- */
  function setKind(k) {
    kind = k;
    document.querySelectorAll('#accKind .seg').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    const box = el('provChips'); box.replaceChildren();
    for (const p of PROVIDERS[k]) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = p;
      c.onclick = () => {
        el('accProvider').value = p === 'Lainnya' ? '' : p;
        box.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
        if (p === 'Lainnya') el('accProvider').focus();
      };
      box.append(c);
    }
    el('accProvider').value = k === 'cash' ? 'Tunai' : '';
  }

  async function saveAccount() {
    const provider = el('accProvider').value.trim(), name = el('accName').value.trim() || provider;
    const last4 = el('accLast4').value.trim(), open = Number(el('accOpen').value || 0);
    if (!provider) return say('accMsg', 'Pilih atau ketik nama bank/dompet.');
    if (last4 && !/^\d{4}$/.test(last4)) return say('accMsg', '4 digit terakhir harus 4 angka (atau kosongkan).');
    if (!Number.isFinite(open)) return say('accMsg', 'Saldo awal tidak valid.');
    const { error } = await db.from('accounts').insert({ kind, provider, name, last4: last4 || null, opening_balance: open });
    if (error) return say('accMsg', 'Gagal menyimpan: ' + error.message);
    closeS('accSheet'); toast('Rekening ditambahkan ✓'); load();
  }

  async function archive(id) {
    if (!confirm('Arsipkan rekening ini? Riwayat transaksinya tetap tersimpan.')) return;
    const { error } = await db.from('accounts').update({ archived: true }).eq('id', id);
    if (error) toast('Gagal: ' + error.message); else load();
  }

  /* ---------- transfer ---------- */
  function openTransfer() {
    if (active().length < 2) return toast('Tambahkan minimal 2 rekening dulu.');
    fillSelects(); el('trDate').value = today(); el('trAmount').value = ''; el('trFee').value = ''; el('trNote').value = '';
    say('trMsg', '', false); openS('trSheet');
  }

  async function saveTransfer() {
    const from = el('trFrom').value, to = el('trTo').value, amount = Number(el('trAmount').value), fee = Number(el('trFee').value || 0);
    if (!from || !to || from === to) return say('trMsg', 'Pilih dua rekening yang berbeda.');
    if (!(amount > 0)) return say('trMsg', 'Isi jumlah transfer (> 0).');
    if (!(fee >= 0)) return say('trMsg', 'Biaya admin tidak valid.');
    const { error } = await db.rpc('make_transfer', { p_from: from, p_to: to, p_amount: amount, p_fee: fee, p_date: el('trDate').value || today(), p_note: el('trNote').value.trim() || null });
    if (error) return say('trMsg', 'Gagal: ' + error.message);
    if (window.FX) { const r = el('btnTrSave').getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top, 10, 'spark'); }
    closeS('trSheet'); toast('Transfer tercatat ✓'); load(); if (typeof loadTx === 'function') loadTx();
  }

  async function delTransfer(id) {
    if (!confirm('Batalkan transfer ini? (Biaya admin, jika ada, tetap tercatat sebagai pengeluaran.)')) return;
    const { error } = await db.from('transfers').delete().eq('id', id);
    if (error) toast('Gagal: ' + error.message); else load();
  }

  /* ---------- impor CSV ---------- */
  function openCsv() {
    if (!active().length) return toast('Tambahkan rekening dulu.');
    fillSelects(); csv = null; el('csvMap').hidden = true; el('btnCsvImport').hidden = true; say('csvMsg', '', false); openS('csvSheet');
  }

  function fillMapSelects() {
    const names = csv.header.map((h, i) => `${i + 1}. ${norm(h) || '(kosong)'}`);
    for (const [key, id] of [['date', 'csvDate'], ['desc', 'csvDesc'], ['amt', 'csvAmt'], ['debit', 'csvDebit'], ['credit', 'csvCredit']]) {
      const s = el(id); s.replaceChildren();
      const none = document.createElement('option'); none.value = '-1'; none.textContent = '— tidak ada —'; s.append(none);
      names.forEach((n, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = n; s.append(o); });
      s.value = String(map[key]);
    }
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#csvMode .seg').forEach((b) => b.classList.toggle('on', b.dataset.md === m));
    el('lblAmt').hidden = m !== 'single'; el('lblDebit').hidden = m !== 'split'; el('lblCredit').hidden = m !== 'split';
    previewCsv();
  }

  function buildRows() {
    const out = []; let bad = 0; const sgn = el('csvInvert').checked ? -1 : 1;
    for (const r of csv.body) {
      const date = parseDate(r[map.date]);
      if (!date) { bad++; continue; }
      let amt;
      if (mode === 'split') {
        const d = parseAmount(r[map.debit]), c = parseAmount(r[map.credit]);
        amt = (d == null && c == null) ? null : Math.abs(c || 0) - Math.abs(d || 0);
      } else amt = parseAmount(r[map.amt]);
      if (amt == null || amt === 0) { bad++; continue; }
      out.push({ date, desc: norm(r[map.desc]).replace(/\s+/g, ' ').slice(0, 300), amount: amt * sgn });
    }
    return { rows: out, bad };
  }

  function previewCsv() {
    const ul = el('csvPreview'); ul.replaceChildren();
    if (!csv) return;
    const { rows, bad } = buildRows();
    el('btnCsvImport').hidden = !rows.length;
    say('csvMsg', rows.length ? `${rows.length} baris siap diimpor${bad ? `, ${bad} baris dilewati` : ''}.` : 'Belum ada baris valid. Periksa pilihan kolom di atas.', !rows.length);
    for (const r of rows.slice(0, 5)) {
      const li = document.createElement('li'); li.className = 'pv';
      const d = document.createElement('small'); d.textContent = r.date;
      const n = document.createElement('span'); n.className = 'pvd'; n.textContent = r.desc || '(tanpa keterangan)';
      const a = document.createElement('b'); a.className = r.amount < 0 ? 'expense' : 'income'; a.textContent = (r.amount < 0 ? '−' : '+') + rupiah(Math.abs(r.amount));
      li.append(d, n, a); ul.append(li);
    }
  }

  function readCsv(file) {
    if (file.size > 2 * 1024 * 1024) return say('csvMsg', 'Ukuran file maksimal 2 MB.');
    const fr = new FileReader();
    fr.onerror = () => say('csvMsg', 'Gagal membaca file.');
    fr.onload = () => {
      const text = String(fr.result).replace(/^\uFEFF/, '');
      const delim = detectDelim(text), rows = parseCsv(text, delim);
      if (rows.length < 2) return say('csvMsg', 'File kosong atau bukan CSV. Simpan mutasi sebagai CSV (bukan Excel).');
      const HDR = /tanggal|tgl|date|keterangan|deskripsi|uraian|description|debit|kredit|credit|jumlah|amount|mutasi|saldo|balance/i;
      let h = 0;
      for (let i = 0; i < Math.min(rows.length, 20); i++) if (rows[i].filter((c) => HDR.test(c)).length >= 2) { h = i; break; }
      const header = rows[h], find = (re, ex = []) => header.findIndex((c, k) => re.test(c) && !ex.includes(k));
      map.date = find(/tanggal|tgl|date|waktu/i);
      map.desc = find(/keterangan|deskripsi|uraian|description|berita|remark|transaksi|detail|narasi/i, [map.date]);
      map.debit = find(/debit|debet|keluar|\bdb\b/i);
      map.credit = find(/kredit|credit|masuk|\bcr\b/i);
      map.amt = find(/jumlah|amount|nominal|mutasi/i, [map.debit, map.credit]);
      csv = { header, body: rows.slice(h + 1) };
      el('csvInfo').textContent = `${csv.body.length} baris data · pemisah: ${delim === '\t' ? 'tab' : '"' + delim + '"'}`;
      el('csvMap').hidden = false; fillMapSelects();
      setMode(map.debit >= 0 && map.credit >= 0 ? 'split' : 'single');
    };
    fr.readAsText(file, 'utf-8');
  }

  async function doImport() {
    const acc = el('csvAcc').value;
    if (!acc) return say('csvMsg', 'Pilih rekening tujuan.');
    const { rows } = buildRows();
    if (!rows.length) return say('csvMsg', 'Tidak ada baris valid.');
    if (rows.length > 2000) return say('csvMsg', 'Maksimal 2000 baris per impor. Pecah file Anda.');
    el('btnCsvImport').disabled = true; say('csvMsg', 'Mengimpor...', false);
    try {
      const uid = await currentUid(), seen = new Map(), payload = [];
      for (const r of rows) {
        const base = `${acc}|${r.date}|${r.amount}|${r.desc}`, n = (seen.get(base) || 0) + 1; seen.set(base, n);
        payload.push({ user_id: uid, account_id: acc, type: r.amount < 0 ? 'expense' : 'income', amount: Math.abs(r.amount), category: 'Impor', note: r.desc || null, date: r.date, import_hash: await sha(base + '|' + n) });
      }
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 200) {
        const { data, error } = await db.from('transactions').upsert(payload.slice(i, i + 200), { onConflict: 'user_id,import_hash', ignoreDuplicates: true }).select('id');
        if (error) throw error;
        inserted += data.length;
      }
      closeS('csvSheet');
      toast(`${inserted} transaksi diimpor${rows.length - inserted ? `, ${rows.length - inserted} duplikat dilewati` : ''} ✓`);
      load(); if (typeof loadTx === 'function') loadTx();
    } catch (e) { say('csvMsg', 'Gagal impor: ' + (e.message || e)); }
    finally { el('btnCsvImport').disabled = false; }
  }

  function init() {
    document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeS(b.dataset.close); });
    el('btnAccAdd').onclick = () => { setKind('bank'); ['accName', 'accLast4', 'accOpen'].forEach((i) => { el(i).value = ''; }); say('accMsg', '', false); openS('accSheet'); };
    document.querySelectorAll('#accKind .seg').forEach((b) => { b.onclick = () => setKind(b.dataset.k); });
    el('btnAccSave').onclick = saveAccount;
    el('btnTransfer').onclick = openTransfer; el('btnTrSave').onclick = saveTransfer;
    el('btnCsv').onclick = openCsv;
    el('btnCsvPick').onclick = () => el('csvFile').click();
    el('csvFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) readCsv(f); };
    document.querySelectorAll('#csvMode .seg').forEach((b) => { b.onclick = () => setMode(b.dataset.md); });
    for (const [key, id] of [['date', 'csvDate'], ['desc', 'csvDesc'], ['amt', 'csvAmt'], ['debit', 'csvDebit'], ['credit', 'csvCredit']]) {
      el(id).onchange = (e) => { map[key] = Number(e.target.value); previewCsv(); };
    }
    el('csvInvert').onchange = previewCsv;
    el('btnCsvImport').onclick = doImport;
    setKind('bank');
  }

  return { init, load, leave, label, fillSelects, closeAll, _t: { parseAmount, parseDate, parseCsv, detectDelim } };
})();
