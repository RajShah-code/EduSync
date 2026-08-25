const { app, BrowserWindow, session, desktopCapturer, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { randomUUID } = require("crypto");
const serveHandler = require("serve-handler");
const { exec } = require("child_process");

app.commandLine.appendSwitch('remote-debugging-port', '9222');

let server = null;
let capturedWindowsUsernamePromise = null;

function captureWindowsUsername() {
  if (!capturedWindowsUsernamePromise) {
    capturedWindowsUsernamePromise = new Promise((resolve) => {
      exec("whoami", { windowsHide: true }, (error, stdout, stderr) => {
        if (error || !stdout) {
          console.log("[Electron Main] whoami failed or empty output:", error);
          return resolve(null);
        }
        const raw = stdout.trim();
        const parts = raw.split("\\");
        const username = parts[parts.length - 1].trim();
        console.log(`[Electron Main] Captured raw whoami "${raw}" -> username "${username}"`);
        resolve(username);
      });
    });
  }
  return capturedWindowsUsernamePromise;
}

ipcMain.handle("get-windows-username", async () => {
  return await captureWindowsUsername();
});

// ── Session recording: native save-to-disk ──────────────────────────────────
// Mirrors the browser build's File System Access API flow (showSaveFilePicker
// + createWritable + incremental chunk writes) but with a real OS dialog and
// a real filesystem path — the web API deliberately never exposes a path to
// JS, so "show this file in Explorer/Finder" (recording:show-in-folder,
// below) is only possible for recordings saved through this native path.
const openRecordingStreams = new Map(); // token -> fs.WriteStream

ipcMain.handle("recording:start-save", async (event, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName,
    filters: [{ name: "WebM Video", extensions: ["webm"] }],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  const token = randomUUID();
  const stream = fs.createWriteStream(result.filePath);
  openRecordingStreams.set(token, stream);
  return { canceled: false, token, filePath: result.filePath };
});

ipcMain.handle("recording:write-chunk", (event, token, arrayBuffer) => {
  const stream = openRecordingStreams.get(token);
  if (!stream) return { ok: false, error: "No open recording stream for this token" };
  return new Promise((resolve) => {
    stream.write(Buffer.from(arrayBuffer), (err) => {
      resolve(err ? { ok: false, error: err.message } : { ok: true });
    });
  });
});

ipcMain.handle("recording:close", (event, token) => {
  const stream = openRecordingStreams.get(token);
  if (!stream) return { ok: false, error: "No open recording stream for this token" };
  return new Promise((resolve) => {
    stream.end(() => {
      openRecordingStreams.delete(token);
      resolve({ ok: true });
    });
  });
});

ipcMain.handle("recording:show-in-folder", (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: "File no longer exists at that path" };
  }
  shell.showItemInFolder(filePath);
  return { ok: true };
});

// ── Per-class OS-level app allow-list enforcement (broadcast sessions) ──────
// See docs/PRD §10.5/§10.8 and Backend's app_allowlist_entries table. This
// is the ONLY place in the codebase that enumerates or kills OS processes —
// deliberately isolated the same way useFocusGuard.js isolates the
// fullscreen/visibility APIs, so this can be extended (or ported to macOS/
// Linux equivalents of tasklist/taskkill) without touching renderer code.
//
// SAFETY: the list below is hardcoded and NOT admin-configurable from the
// DB, on purpose — an admin's allow-list only ever ADDS to what's allowed,
// it can never narrow this list. This is what prevents a misconfigured or
// too-narrow class allow-list from ever causing core OS processes (or this
// app itself) to be force-closed.
// Verified against a real `tasklist /FO CSV /NH` dump during development
// (not written from memory alone) — that pass caught several genuinely
// OS-critical entries (Secure System, LsaIso.exe, WUDFHost.exe, etc.) that
// a from-memory list would have missed.
const SYSTEM_SAFE_PROCESS_NAMES = new Set([
  'explorer.exe', 'dwm.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe',
  'services.exe', 'lsass.exe', 'svchost.exe', 'system', 'system idle process',
  'secure system', 'registry', 'memory compression',
  'smss.exe', 'fontdrvhost.exe', 'sihost.exe', 'taskhostw.exe', 'ctfmon.exe',
  'searchindexer.exe', 'searchapp.exe', 'searchhost.exe', 'searchprotocolhost.exe',
  'dllhost.exe', 'conhost.exe', 'runtimebroker.exe', 'shellexperiencehost.exe',
  'shellhost.exe', 'startmenuexperiencehost.exe', 'applicationframehost.exe',
  'aggregatorhost.exe', 'textinputhost.exe', 'audiodg.exe', 'spoolsv.exe',
  'wudfhost.exe', 'wmiregistrationservice.exe', 'wmiprvse.exe',
  'lsaiso.exe', 'ngciso.exe',
  'securityhealthservice.exe', 'securityhealthsystray.exe', 'msmpeng.exe',
  'mpdefendercoreservice.exe', 'nissrv.exe',
]);
// The Electron shell's own process (electron.exe in dev, the packaged
// productName.exe in a built app) must never be closeable by its own guard.
const SELF_PROCESS_NAME = path.basename(process.execPath).toLowerCase();

let appGuardInterval = null;

function parseTasklistCsv(stdout) {
  // `tasklist /FO CSV /NH` — one CSV row per process, no header, columns
  // quoted: "Image Name","PID","Session Name","Session#","Mem Usage"
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
      return { imageName: cols[0], pid: cols[1] };
    })
    .filter((row) => row.imageName && row.pid);
}

ipcMain.handle('app-guard:start', (event, allowList) => {
  if (appGuardInterval) clearInterval(appGuardInterval);

  const allowedLower = new Set((allowList || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean));

  appGuardInterval = setInterval(() => {
    exec('tasklist /FO CSV /NH', { windowsHide: true }, (error, stdout) => {
      if (error || !stdout) return;
      const processes = parseTasklistCsv(stdout);

      for (const proc of processes) {
        const nameLower = proc.imageName.toLowerCase();
        if (nameLower === SELF_PROCESS_NAME) continue;
        if (SYSTEM_SAFE_PROCESS_NAMES.has(nameLower)) continue;
        if (allowedLower.has(nameLower)) continue;

        exec(`taskkill /PID ${proc.pid} /F`, { windowsHide: true }, (killErr) => {
          if (killErr) {
            console.warn(`[AppGuard] Failed to close ${proc.imageName} (PID ${proc.pid}):`, killErr.message);
            return;
          }
          console.log(`[AppGuard] Closed disallowed process: ${proc.imageName} (PID ${proc.pid})`);
          event.sender.send('app-guard:violation', {
            processName: proc.imageName,
            timestamp: Date.now(),
          });
        });
      }
    });
  }, 5000);

  return { ok: true };
});

ipcMain.handle('app-guard:stop', () => {
  if (appGuardInterval) {
    clearInterval(appGuardInterval);
    appGuardInterval = null;
  }
  return { ok: true };
});

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const distPath = path.join(__dirname, "../dist");
    server = http.createServer((request, response) => {
      return serveHandler(request, response, {
        public: distPath,
        rewrites: [{ source: "**", destination: "/index.html" }],
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}`;
      console.log(`[Electron Main] Static HTTP server listening on ${url}`);
      resolve(url);
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    title: "EduSync",
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

  if (isDev) {
    console.log("[Electron Main] Loading dev URL: http://localhost:5173");
    await win.loadURL("http://localhost:5173");
  } else {
    const serverUrl = await startStaticServer();
    console.log(`[Electron Main] Loading production URL: ${serverUrl}`);
    await win.loadURL(serverUrl);
  }
}

app.whenReady().then(() => {
  captureWindowsUsername();

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      callback({ video: sources[0], audio: "loopback" });
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (server) {
    server.close();
  }
  if (appGuardInterval) {
    clearInterval(appGuardInterval);
    appGuardInterval = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
