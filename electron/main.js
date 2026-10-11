const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');

const PROTOCOL = 'uangq';
let win = null;
let pendingUrl = null;

if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const isAuthUrl = (u) => typeof u === 'string' && u.startsWith(PROTOCOL + '://auth');
function deliver(url) {
  if (!isAuthUrl(url)) return;
  if (win && !win.webContents.isLoading()) win.webContents.send('auth-callback', url);
  else pendingUrl = url;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 720, title: 'UangQ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  win.webContents.on('did-finish-load', () => { if (pendingUrl) { deliver(pendingUrl); pendingUrl = null; } });

  // Kunci navigasi: hanya halaman aplikasi sendiri yang boleh dimuat.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.on('closed', () => { win = null; });
}

ipcMain.handle('open-external', (e, url) => {
  const u = new URL(url);
  const ok = u.protocol === 'https:' && (u.hostname.endsWith('.supabase.co') || u.hostname === 'accounts.google.com');
  if (!ok) throw new Error('URL tidak diizinkan.');
  return shell.openExternal(url);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    deliver(argv.find(isAuthUrl));
  });
  app.on('open-url', (e, url) => { e.preventDefault(); deliver(url); }); // macOS
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    app.on('web-contents-created', (_e, contents) => contents.on('will-attach-webview', (ev) => ev.preventDefault()));
    createWindow();
    pendingUrl = process.argv.find(isAuthUrl) || null;
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
