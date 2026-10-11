# UangQ (APK + EXE, database bersama, login Google)

## A. Supabase (database)
1. SQL Editor > tempel `supabase/schema.sql` > Run (aman dijalankan ulang).
2. Authentication > Sign In / Providers:
   - **Google**: aktifkan, isi Client ID & Secret (lihat B).
   - **Email**: matikan (login hanya via Google).
   - Pastikan MFA TOTP aktif (enroll & verify).
3. Authentication > URL Configuration > **Redirect URLs**, tambahkan:
   `com.uangq.app://auth` dan `uangq://auth`
4. Isi `www/config.js` dengan Project URL + anon key.

## B. Google Cloud (sekali saja)
1. console.cloud.google.com > buat project > **OAuth consent screen** (External, nama UangQ, email Anda; tambahkan email Anda di Test users).
2. **Credentials > Create credentials > OAuth client ID > Web application**.
   Authorized redirect URI: `https://<PROJECT-REF>.supabase.co/auth/v1/callback`
3. Salin Client ID & Client Secret ke Supabase (langkah A2).

## C. GitHub Actions
1. Settings > Secrets and variables > Actions > New repository secret:
   `KEYSTORE_PASSPHRASE` = kalimat acak minimal 16 karakter (SIMPAN di tempat aman).
2. Actions > **Buat Keystore Android (sekali saja)** > Run workflow.
3. Actions > **Build APK & EXE** > Run workflow > unduh dari Artifacts.

## D. Catatan pemasangan
- Windows: pakai installer `UangQ Setup x.y.z.exe` (bukan portable) agar login Google bisa kembali ke aplikasi.
- Android: ekstrak zip, pasang `UangQ.apk`. Hapus aplikasi lama (Catatan Keuangan) dulu.
- Screenshot diblokir di Android demi keamanan; ubah `SECURE_SCREEN` di `build.yml` jika perlu.

## E. Mengganti gambar latar, logo, dan ikon
**Di dalam aplikasi (tanpa apa pun):** Pengaturan > Tampilan > pilih tema, pilih gambar latar sendiri, atur animasi.

**Mengganti bawaan (perlu build ulang):**
- Gambar latar & logo dalam aplikasi: timpa file di `www/theme/` (`bg-*.svg/png/jpg`, `logo.svg`) atau edit `www/theme/theme-pack.js` untuk menambah tema.
- Ikon aplikasi & splash: timpa file di `assets/` (`icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`, ukuran 1024 / 2732 px) dan `build/icon.png` (ikon Windows, min. 256 px).
- Atau ubah desain lewat `python tools/make_art.py` (butuh `pip install pillow numpy`).

**Memperbarui tema TANPA build ulang:**
1. Supabase > Storage > bucket **theme** (dibuat otomatis oleh `schema.sql`).
2. Unggah gambar baru dan file `theme.json` (contoh: `docs/theme.example.json`).
3. Di aplikasi: Pengaturan > Tampilan > **Perbarui tema dari server** (juga otomatis tiap aplikasi dibuka).
Hanya gambar dari bucket `theme` proyek Anda yang diterima; warna & isi `theme.json` divalidasi ketat.
Ikon peluncur (di layar utama HP/PC) ditentukan sistem operasi, jadi hanya berubah lewat build ulang.

## F. Rekening bank, dompet digital, dan impor mutasi
Tab **Rekening**: tambah bank (mis. Bank Sultra, BRI, BNI, Mandiri, BCA, BSI, BTN, dll., atau ketik nama lain), dompet digital (GoPay, OVO, DANA, ShopeePay, LinkAja, atau ketik sendiri), dan tunai.
- Saldo tiap rekening = saldo awal + transaksi + transfer yang dicatat. Transaksi baru bisa ditautkan ke rekening.
- **Transfer** antar rekening (biaya admin otomatis tercatat sebagai pengeluaran).
- **Impor CSV**: unduh mutasi dari m-banking/e-wallet sebagai CSV, pilih file, cek pemetaan kolom (tanggal, keterangan, jumlah atau debit/kredit), lalu impor. Baris yang sama tidak diimpor dua kali. File Excel (.xlsx) harus disimpan dulu sebagai CSV.
- Nomor rekening lengkap TIDAK disimpan; hanya 4 digit terakhir (opsional).
- Aplikasi ini belum menarik saldo/mutasi otomatis dari bank. Lihat `docs/bank-aggregator.md` untuk jalur ke sana.
Jalankan ulang `supabase/schema.sql` agar tabel rekening/transfer dibuat.
