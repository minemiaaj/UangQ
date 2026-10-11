'use strict';
// Efek latar: koin/percikan/gelembung melayang (menghindari kursor/jari), parallax, miring kartu, ledakan koin.
const FX = (() => {
  const canvas = document.getElementById('fx'), ctx = canvas.getContext('2d');
  const scene = document.getElementById('scene'), root = document.documentElement;
  const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* abaikan */ } };
  const rnd = (a, b) => a + Math.random() * (b - a);

  let mode = get('uangq.fx.mode') || (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'full');
  let touchFx = get('uangq.fx.touch') !== '0';
  let kind = 'coin', cA = '#34d399', cB = '#fbbf24';
  let W = 0, H = 0, dpr = 1, parts = [], bursts = [], raf = 0, last = 0, tiltEl = null;
  const ptr = { x: -9999, y: -9999 }, par = { x: 0, y: 0, tx: 0, ty: 0 };

  function mk() {
    return { x: rnd(0, W), y: rnd(0, H), r: rnd(7, 17), vy: -rnd(6, 18), ph: rnd(0, 6.28), sp: rnd(.6, 1.6), rs: rnd(.8, 2.2), a: rnd(.35, .8), px: 0, py: 0 };
  }
  function seed() {
    const n = mode === 'off' || kind === 'none' ? 0 : mode === 'lite' ? 10 : Math.min(34, Math.round(W * H / 38000));
    parts = Array.from({ length: n }, mk);
  }
  function resize() {
    const wChanged = innerWidth !== W;
    dpr = mode === 'lite' ? 1 : Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wChanged || !parts.length) seed();
  }

  function drawOne(k, x, y, r, ph, a, T, alt) {
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.translate(x, y);
    if (k === 'coin') {
      ctx.scale(Math.abs(Math.cos(ph)) * .85 + .15, 1);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fillStyle = '#f5c451'; ctx.fill();
      ctx.lineWidth = Math.max(1, r * .14); ctx.strokeStyle = '#b7791f'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * .6, 0, 6.2832); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.stroke();
    } else if (k === 'spark') {
      const s = r * (.6 + .4 * Math.sin(T * 3 + ph)); ctx.rotate(ph);
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.fillStyle = alt ? cA : cB; ctx.fill();
    } else if (k === 'bubble') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * .35, -r * .35, r * .22, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    }
    ctx.restore();
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (t - last) / 1000 || .016); last = t; const T = t / 1000;
    par.x += (par.tx - par.x) * .06; par.y += (par.ty - par.y) * .06;
    scene.style.setProperty('--px', par.x.toFixed(1) + 'px'); scene.style.setProperty('--py', par.y.toFixed(1) + 'px');
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.y += p.vy * dt + p.py * dt; p.x += Math.sin(T * p.sp + p.ph) * 10 * dt + p.px * dt;
      p.px *= .92; p.py *= .92;
      const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
      if (d2 < 14400) { const d = Math.sqrt(d2) || 1, f = (120 - d) / 120 * 260; p.px += dx / d * f * dt * 8; p.py += dy / d * f * dt * 8; }
      if (p.y < -30) { p.y = H + 30; p.x = rnd(0, W); }
      if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
      drawOne(kind, p.x, p.y, p.r, p.ph + T * p.rs, p.a, T, p.ph > 3);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.life -= dt;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }
      b.vy += 520 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      drawOne(b.k, b.x, b.y, b.r, b.ph + T * 6, b.life / b.max, T, b.alt);
    }
  }

  function run() {
    cancelAnimationFrame(raf);
    if (mode === 'off' || document.hidden) { ctx.clearRect(0, 0, W, H); return; }
    last = performance.now(); raf = requestAnimationFrame(frame);
  }

  function burst(x, y, n, k) {
    if (mode === 'off') return;
    const cnt = mode === 'lite' ? Math.ceil(n / 2) : n;
    for (let i = 0; i < cnt; i++) {
      const up = k === 'coin';
      bursts.push({ k, x, y, vx: rnd(-220, 220), vy: up ? -rnd(300, 560) : rnd(-160, 40), r: up ? rnd(8, 14) : rnd(5, 9), ph: rnd(0, 6.28), alt: i % 2 === 0, life: up ? 1.3 : .7, max: up ? 1.3 : .7 });
    }
    if (bursts.length > 120) bursts.splice(0, bursts.length - 120);
  }

  function tilt(e) {
    if (e.pointerType !== 'mouse' || mode === 'off') return;
    const el = e.target.closest && e.target.closest('.tilt');
    if (tiltEl && tiltEl !== el) { tiltEl.style.setProperty('--rx', '0deg'); tiltEl.style.setProperty('--ry', '0deg'); tiltEl = null; }
    if (!el) return; tiltEl = el;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    el.style.setProperty('--ry', (px * 8).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-py * 8).toFixed(2) + 'deg');
  }

  addEventListener('pointermove', (e) => {
    if (mode === 'off') return;
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (mode === 'full') { par.tx = (e.clientX / W - .5) * -18; par.ty = (e.clientY / H - .5) * -18; }
    tilt(e);
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (mode === 'off') return;
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (touchFx && !(e.target.closest && e.target.closest('input,textarea,select'))) burst(e.clientX, e.clientY, 6, 'spark');
  }, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') setTimeout(() => { ptr.x = ptr.y = -9999; }, 300); }, { passive: true });
  document.addEventListener('pointerleave', () => { ptr.x = ptr.y = -9999; par.tx = par.ty = 0; });
  document.addEventListener('visibilitychange', run);
  let rt = 0; addEventListener('resize', () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(resize); });

  root.dataset.fx = mode; resize(); run();

  return {
    mode: () => mode,
    setMode(m) { if (!['full', 'lite', 'off'].includes(m)) return; mode = m; put('uangq.fx.mode', m); root.dataset.fx = m; par.tx = par.ty = 0; resize(); seed(); run(); },
    touch: () => touchFx,
    setTouch(b) { touchFx = !!b; put('uangq.fx.touch', b ? '1' : '0'); },
    setKind(k) { kind = ['coin', 'spark', 'bubble', 'none'].includes(k) ? k : 'none'; seed(); },
    setColors(a, b) { cA = a; cB = b; },
    burst,
    celebrate(x, y) { burst(x, y, 22, 'coin'); }
  };
})();
