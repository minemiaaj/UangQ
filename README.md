# Catatan Keuangan (APK + EXE, database bersama)

Satu kode web (`www/`) dibungkus jadi:
- **Android .apk** lewat Capacitor
- **Windows .exe** lewat Electron

Database: **Supabase** (PostgreSQL cloud). Login dengan akun yang sama di semua perangkat
→ data otomatis sama dan realtime. Tiap pengguna hanya bisa melihat datanya sendiri (Row Level Security).

## 1. Siapkan database (sekali saja, gratis)
1. Buat proyek di https://supabase.com
2. Buka **SQL Editor**, tempel isi `supabase/schema.sql`, klik **Run**
3. Buka **Project Settings > API**, salin **Project URL** dan **anon public key**
4. Isi keduanya di `www/config.js`
5. (Opsional, untuk uji cepat) **Authentication > Providers > Email**: matikan "Confirm email"

## 2. Jalankan di komputer
```bash
npm install
npm start
```

## 3. Build file .exe (Windows)
```bash
npm run build:exe
```
Hasil: folder `dist/` (installer `.exe` dan versi portable).

## 4. Build file .apk (Android)
Butuh Node 18+, JDK 17, dan Android SDK (atau Android Studio).
```bash
npm install
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
```
Hasil: `android/app/build/outputs/apk/debug/app-debug.apk`
Untuk rilis ke Play Store, buat keystore lalu `./gradlew assembleRelease` / `bundleRelease`.

## 5. Tanpa install apa pun: pakai GitHub Actions
1. Upload folder ini ke repo GitHub
2. Tab **Actions > Build APK & EXE > Run workflow**
3. Unduh `.apk` dan `.exe` dari bagian **Artifacts**

## Catatan
- Aplikasi butuh internet karena database ada di cloud.
- Ubah `appId` di `package.json` dan `capacitor.config.json` ke ID unik milik Anda.
