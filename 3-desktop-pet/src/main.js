// Taskbar Magpie - main process.
// A transparent, always-on-top, non-activating overlay that covers the primary
// display. The pet is drawn inside it; everything except the pet's opaque
// pixels is click-through. No network access at runtime.

const { app, BrowserWindow, Tray, Menu, screen, powerMonitor, ipcMain, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEBUG = !!process.env.MAGPIE_DEBUG;

let win = null;
let tray = null;
let ignoring = true;
let latestState = { state: 'boot' };
let quitting = false;
let clipChild = null;

app.setName('Taskbar Magpie');
if (process.platform === 'win32') app.setAppUserModelId('com.qwen.taskbarmagpie');
// Software compositing is the stable choice for a transparent 2D overlay on Windows.
app.disableHardwareAcceleration();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => send('action', 'quip'));
  main();
}

function stateFile() {
  return path.join(app.getPath('userData'), 'pet-state.json');
}
function loadSaved() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}
function saveSaved(patch) {
  try {
    const cur = loadSaved();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...cur, ...patch }, null, 2));
  } catch {}
}

function metrics() {
  const d = screen.getPrimaryDisplay();
  return { bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor };
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function setIgnore(v) {
  if (!win || win.isDestroyed()) return;
  ignoring = v;
  win.setIgnoreMouseEvents(v, { forward: true });
}

// The clipboard is watched in an isolated child process: reading the Windows
// clipboard can block on the OLE clipboard, and doing it on the main thread
// would freeze the pet. The child emits base64 lines only when text changes.
function startClipboardWatcher() {
  const script = path.join(__dirname, 'clip-watch.ps1');
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  clipChild = ps;
  let buf = '';
  ps.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const text = Buffer.from(line, 'base64').toString('utf8');
        if (text.trim()) send('clipboard', text);
      } catch {}
    }
  });
  ps.on('exit', () => {
    clipChild = null;
    if (!quitting) setTimeout(startClipboardWatcher, 2000);
  });
}

function createWindow() {
  const b = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,          // WS_EX_NOACTIVATE: never steals focus
    show: false,
    alwaysOnTop: true,
    icon: path.join(ROOT, 'assets', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setIgnore(true);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => { win = null; });
}

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray.png'));
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function buildMenu() {
  const asleep = latestState.state === 'sleep';
  return Menu.buildFromTemplate([
    { label: 'Feed Qwpie a berry', click: () => send('action', 'feed') },
    {
      label: asleep ? 'Wake Qwpie up' : 'Put Qwpie to sleep',
      click: () => send('action', asleep ? 'wake' : 'sleep'),
    },
    { type: 'separator' },
    { label: 'Exit', click: () => quitApp() },
  ]);
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildMenu());
}

// The overlay is closable:false so it can't be dismissed accidentally; exit
// therefore destroys the window explicitly (app.quit() alone would be blocked).
function quitApp() {
  quitting = true;
  if (clipChild) { try { clipChild.kill(); } catch {} }
  if (latestState.save) saveSaved(latestState.save);
  if (win && !win.isDestroyed()) win.destroy();
  app.quit();
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Qwpie the magpie - collects the shiny things you copy');
  refreshTray();
  tray.on('click', () => send('action', 'quip'));
}

function main() {
  app.whenReady().then(() => {
    createWindow();
    createTray();

    ipcMain.on('set-ignore', (_e, v) => setIgnore(Boolean(v)));
    ipcMain.on('pet-state', (_e, s) => {
      const prevSleep = latestState.state === 'sleep';
      latestState = s;
      if ((s.state === 'sleep') !== prevSleep) refreshTray();
      if (s.save) saveSaved(s.save);
    });
    ipcMain.handle('get-init', () => ({ metrics: metrics(), saved: loadSaved() }));

    startClipboardWatcher();

    // System-wide idle time (seconds since last keyboard/mouse input).
    setInterval(() => {
      let s = 0;
      try { s = powerMonitor.getSystemIdleTime(); } catch {}
      send('idle', s);
    }, 1000);

    const onDisplay = () => {
      if (!win || win.isDestroyed()) return;
      win.setBounds(screen.getPrimaryDisplay().bounds);
      send('metrics', metrics());
    };
    screen.on('display-metrics-changed', onDisplay);
    screen.on('display-added', onDisplay);
    screen.on('display-removed', onDisplay);

    if (DEBUG) {
      global.__magpie = {
        get state() { return latestState; },
        get ignoring() { return ignoring; },
        get trayItems() { return buildMenu().items.map((i) => i.label); },
        metrics,
        actions: {
          feed: () => send('action', 'feed'),
          sleep: () => send('action', 'sleep'),
          wake: () => send('action', 'wake'),
          quip: () => send('action', 'quip'),
          exit: () => quitApp(),
        },
      };
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    if (clipChild) { try { clipChild.kill(); } catch {} }
    if (latestState.save) saveSaved(latestState.save);
  });
}
