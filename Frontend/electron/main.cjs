const { app, BrowserWindow, session, desktopCapturer } = require("electron");
const path = require("path");
const http = require("http");
const serveHandler = require("serve-handler");

app.commandLine.appendSwitch('remote-debugging-port', '9222');

let server = null;

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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
