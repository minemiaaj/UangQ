// Menyalin supabase-js (versi terkunci) ke www/vendor agar aplikasi tidak memuat skrip dari CDN.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const dst = path.join(__dirname, '..', 'www', 'vendor', 'supabase.js');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('vendor/supabase.js siap');
