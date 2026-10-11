// Paket tema bawaan. Cara mengganti gambar/ikon:
//  1) Timpa file di folder www/theme/ (nama sama), atau tambah preset baru di bawah, lalu build ulang; ATAU
//  2) Tanpa build ulang: unggah theme.json + gambar ke Supabase Storage (bucket "theme"), lihat README.
//  3) Pengguna juga bisa memilih gambar latar sendiri dari Pengaturan > Tampilan.
const THEME_PACK = {
  version: 1,
  logo: 'theme/logo.svg',
  defaultPreset: 'aurora',
  presets: [
    { id: 'aurora', name: 'Aurora', mode: 'dark', background: 'theme/bg-aurora.svg', particles: 'coin',
      colors: { bg: '#070b14', text: '#eef2ff', dim: '#9aa7c7', accent: '#34d399', accentB: '#22d3ee', accent2: '#fbbf24', income: '#34d399', expense: '#fb7185' } },
    { id: 'senja', name: 'Senja', mode: 'dark', background: 'theme/bg-senja.svg', particles: 'spark',
      colors: { bg: '#140a1f', text: '#fff1e6', dim: '#d1a9b8', accent: '#fb923c', accentB: '#f43f5e', accent2: '#fde047', income: '#4ade80', expense: '#fb7185' } },
    { id: 'samudra', name: 'Samudra', mode: 'dark', background: 'theme/bg-samudra.svg', particles: 'bubble',
      colors: { bg: '#04101f', text: '#e6f4ff', dim: '#8fb3d1', accent: '#38bdf8', accentB: '#6366f1', accent2: '#5eead4', income: '#2dd4bf', expense: '#fb7185' } },
    { id: 'pagi', name: 'Pagi', mode: 'light', background: 'theme/bg-pagi.svg', particles: 'coin',
      colors: { bg: '#eef4fb', text: '#0f172a', dim: '#475569', accent: '#059669', accentB: '#0891b2', accent2: '#d97706', income: '#047857', expense: '#e11d48' } }
  ]
};
