// Dijalankan SETELAH "npx cap add android". Mengatur deep link login Google,
// mengeraskan keamanan Android, dan menaikkan versionCode agar APK baru bisa menimpa yang lama.
const fs = require('fs'), path = require('path');
const APP_ID = 'com.uangq.app';
const base = 'android/app/src/main';

const mfPath = path.join(base, 'AndroidManifest.xml');
if (!fs.existsSync(mfPath)) { console.error('Folder android belum ada. Jalankan: npx cap add android'); process.exit(1); }

let m = fs.readFileSync(mfPath, 'utf8');
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"');
if (!m.includes('usesCleartextTraffic')) m = m.replace('<application', '<application android:usesCleartextTraffic="false"');
if (!m.includes(`android:scheme="${APP_ID}"`)) {
  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${APP_ID}" android:host="auth" />
            </intent-filter>
        `;
  m = m.replace('</activity>', filter + '</activity>');
}
fs.writeFileSync(mfPath, m);

const gPath = 'android/app/build.gradle';
let g = fs.readFileSync(gPath, 'utf8');
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + (process.env.VERSION_CODE || '1'));
if (process.env.VERSION_NAME) g = g.replace(/versionName\s+"[^"]*"/, `versionName "${process.env.VERSION_NAME}"`);
fs.writeFileSync(gPath, g);

// Blokir screenshot & pratinjau layar di recent apps (FLAG_SECURE). Matikan dengan SECURE_SCREEN=false
if (process.env.SECURE_SCREEN !== 'false') {
  const dir = path.join(base, 'java', ...APP_ID.split('.'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'MainActivity.java'), `package ${APP_ID};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        super.onCreate(savedInstanceState);
    }
}
`);
}
console.log('patch-android selesai');
