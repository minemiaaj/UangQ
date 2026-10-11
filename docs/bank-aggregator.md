# Menyambungkan bank secara otomatis (rencana, belum aktif)

Saat ini rekening dikelola manual + impor CSV. Penarikan saldo/mutasi otomatis butuh pihak ketiga
berlisensi (agregator open banking/e-wallet) dengan kontrak dan biaya, dan cakupan bank daerah
tidak dijamin. Cek langsung ke penyedia mana saja yang mendukung bank/dompet yang Anda pakai.

Jika nanti ada penyedia yang cocok, rancangannya:
1. Kunci rahasia penyedia hanya disimpan di **Supabase Edge Function** (jangan pernah di `www/` atau APK).
2. Aplikasi memanggil Edge Function (butuh sesi login + 2FA) untuk memulai penautan dan sinkronisasi.
3. Edge Function menulis ke tabel `accounts` (`source = 'aggregator'`, `external_id` = ID opak dari penyedia)
   dan `transactions` (pakai `import_hash` agar tidak dobel).
4. Jangan simpan nomor rekening lengkap, PIN, atau kata sandi bank di database mana pun.
