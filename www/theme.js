'use strict';
// Mesin tema: preset warna + gambar latar, gambar pilihan pengguna, dan pembaruan tema dari server (Supabase Storage).
const Theme = (() => {
  const K = { preset: 'uangq.theme.preset', bg: 'uangq.theme.bg', remote: 'uangq.theme.remote' };
  const HEX = /^#[0-9a-f]{6}$/i, ID = /^[a-z0-9-]{1,24}$/;
  const COLOR_KEYS = ['bg', 'text', 'dim', 'accent', 'accentB', 'accent2', 'income', 'expense'];
  const KINDS = ['coin', 'spark', 'bubble', 'none'];
  const REMOTE_BASE = CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/theme/';
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
    del: (k) => { try { localStorage.removeItem(k); } catch (_) { /* abaikan */ } }
  };
  let presets = [...THEME_PACK.presets], logo = THEME_PACK.logo;

  // Hanya aset lokal "theme/..." atau dari bucket "theme" milik proyek Supabase Anda yang diterima.
  function okAsset(u) {
    if (typeof u !== 'string' || u.includes('..') || u.length > 300) return false;
    if (/^theme\/[A-Za-z0-9._-]+$/.test(u)) return true;
    return u.startsWith(REMOTE_BASE) && /^[A-Za-z0-9._-]+$/.test(u.slice(REMOTE_BASE.length));
  }
  function cleanPreset(p) {
    if (!p || !ID.test(p.id) || typeof p.name !== 'string' || p.name.length > 24 || !['dark', 'light'].includes(p.mode)) return null;
    const colors = {};
    for (const k of COLOR_KEYS) { if (!p.colors || !HEX.test(p.colors[k])) return null; colors[k] = p.colors[k]; }
    if (p.background && !okAsset(p.background)) return null;
    return { id: p.id, name: p.name, mode: p.mode, colors, background: p.background || '', particles: KINDS.includes(p.particles) ? p.particles : 'none' };
  }
  function mergeRemote(pack) {
    const base = [...THEME_PACK.presets]; let lg = THEME_PACK.logo;
    if (pack && Array.isArray(pack.presets)) {
      for (const raw of pack.presets.slice(0, 12)) {
        const c = cleanPreset(raw); if (!c) continue;
        const i = base.findIndex((x) => x.id === c.id);
        if (i >= 0) base[i] = c; else base.push(c);
      }
    }
    if (pack && okAsset(pack.logo)) lg = pack.logo;
    presets = base; logo = lg;
  }

  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const lum = (h) => { const [r, g, b] = hexRgb(h).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const current = () => presets.find((p) => p.id === ls.get(K.preset)) || presets.find((p) => p.id === THEME_PACK.defaultPreset) || presets[0];

  function apply() {
    const p = current(), c = p.colors, dark = p.mode === 'dark', set = (k, v) => root.style.setProperty(k, v);
    root.dataset.mode = p.mode;
    set('--bg', c.bg); set('--text', c.text); set('--dim', c.dim);
    set('--accent', c.accent); set('--accent-b', c.accentB); set('--accent2', c.accent2);
    set('--income', c.income); set('--expense', c.expense);
    set('--on-accent', lum(c.accent) > .35 ? '#04130c' : '#ffffff');
    set('--glow1', rgba(c.accent, dark ? .20 : .16)); set('--glow2', rgba(c.accent2, dark ? .12 : .14));
    set('--nav-bg', rgba(c.bg, dark ? .82 : .88));
    set('--scrim-a', rgba(c.bg, dark ? .45 : .30)); set('--scrim-b', rgba(c.bg, dark ? .88 : .78));
    const img = ls.get(K.bg) || p.background;
    set('--bg-image', img ? `url("${img}")` : 'none');
    document.querySelectorAll('img[data-logo]').forEach((i) => { i.src = logo; });
    if (window.FX) { FX.setKind(p.particles); FX.setColors(c.accent, c.accent2); }
  }

  function buildPresets() {
    const box = $('presetList'); if (!box) return;
    box.replaceChildren();
    const cur = current().id;
    for (const p of presets) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'preset' + (p.id === cur ? ' on' : '');
      const sw = document.createElement('span'); sw.className = 'sw';
      sw.style.setProperty('--a', p.colors.accent); sw.style.setProperty('--b', p.colors.accent2);
      const t = document.createElement('span'); t.textContent = p.name;
      b.append(sw, t);
      b.onclick = () => { ls.set(K.preset, p.id); apply(); buildPresets(); };
      box.append(b);
    }
  }

  function syncFx() {
    if (!window.FX) return;
    document.querySelectorAll('#fxSeg .seg').forEach((b) => b.classList.toggle('on', b.dataset.m === FX.mode()));
    const t = $('fxTouch'); if (t) t.checked = FX.touch();
  }

  function say(text, bad) { const m = $('themeMsg'); if (m) { m.textContent = text; m.className = bad ? 'msg bad' : 'msg'; } }

  function pickBg(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Gunakan gambar PNG, JPG, atau WebP.'));
      if (file.size > 10 * 1024 * 1024) return reject(new Error('Ukuran maksimal 10 MB.'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Gagal membaca file.'));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => reject(new Error('Gambar tidak valid.'));
        im.onload = () => {
          const k = Math.min(1, 1280 / Math.max(im.width, im.height));
          const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          if (!ls.set(K.bg, cv.toDataURL('image/jpeg', .82))) return reject(new Error('Penyimpanan penuh, coba gambar yang lebih kecil.'));
          apply(); resolve();
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  async function refreshRemote() {
    if (CONFIG.SUPABASE_URL.includes('GANTI')) return 'skip';
    try {
      const res = await fetch(REMOTE_BASE + 'theme.json', { cache: 'no-cache' });
      if (!res.ok) return 'none';
      const text = await res.text();
      if (text.length > 20000) return 'error';
      mergeRemote(JSON.parse(text)); ls.set(K.remote, text);
      buildPresets(); apply();
      return 'ok';
    } catch (_) { return 'error'; }
  }

  function wire() {
    const pick = $('btnBgPick'); if (!pick) return;
    pick.onclick = () => $('bgFile').click();
    $('bgFile').onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { await pickBg(f); say('Gambar latar diganti.', false); } catch (err) { say(err.message, true); }
    };
    $('btnBgReset').onclick = () => { ls.del(K.bg); apply(); say('Memakai gambar bawaan tema.', false); };
    document.querySelectorAll('#fxSeg .seg').forEach((b) => { b.onclick = () => { FX.setMode(b.dataset.m); syncFx(); }; });
    $('fxTouch').onchange = (e) => FX.setTouch(e.target.checked);
    $('btnThemeRefresh').onclick = async () => {
      say('Memeriksa server...', false);
      const r = await refreshRemote();
      say(r === 'ok' ? 'Tema diperbarui dari server.' : r === 'none' ? 'Belum ada tema baru di server.' : r === 'skip' ? 'Isi config.js terlebih dulu.' : 'Gagal menghubungi server.', r === 'error');
    };
  }

  const cached = ls.get(K.remote);
  if (cached) { try { mergeRemote(JSON.parse(cached)); } catch (_) { ls.del(K.remote); } }
  buildPresets(); apply(); syncFx(); wire();

  return { refreshRemote };
})();
