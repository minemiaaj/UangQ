'use strict';
// PIN perangkat: disimpan sebagai hash PBKDF2-SHA256 (600.000 iterasi) + salt acak.
// Percobaan salah: jeda eksponensial mulai ke-5, hapus sesi di ke-10.
const Lock = (() => {
  const enc = new TextEncoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const kPin = (uid) => `uangq.pin.${uid}`;
  const kFail = (uid) => `uangq.fail.${uid}`;

  async function derive(pin, salt) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, key, 256);
  }

  return {
    has: (uid) => !!localStorage.getItem(kPin(uid)),
    clear(uid) { localStorage.removeItem(kPin(uid)); localStorage.removeItem(kFail(uid)); },
    async set(uid, pin) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const h = await derive(pin, salt);
      localStorage.setItem(kPin(uid), JSON.stringify({ s: b64(salt), h: b64(h) }));
      localStorage.removeItem(kFail(uid));
    },
    async verify(uid, pin) {
      const f = JSON.parse(localStorage.getItem(kFail(uid)) || '{"n":0,"until":0}');
      const now = Date.now();
      if (f.until > now) return { ok: false, wait: Math.ceil((f.until - now) / 1000) };
      const rec = JSON.parse(localStorage.getItem(kPin(uid)) || 'null');
      if (!rec) return { ok: false, wipe: true };
      const got = new Uint8Array(await derive(pin, unb64(rec.s)));
      const want = unb64(rec.h);
      let diff = got.length ^ want.length;
      for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]; // perbandingan waktu-konstan
      if (diff === 0) { localStorage.removeItem(kFail(uid)); return { ok: true }; }
      f.n += 1;
      if (f.n >= 10) return { ok: false, wipe: true };
      if (f.n >= 5) f.until = now + 30000 * 2 ** (f.n - 5);
      localStorage.setItem(kFail(uid), JSON.stringify(f));
      return { ok: false, left: Math.max(0, 5 - f.n) };
    }
  };
})();
