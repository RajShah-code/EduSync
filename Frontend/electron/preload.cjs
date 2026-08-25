const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  getWindowsUsername: () => ipcRenderer.invoke("get-windows-username"),

  // Session recording — native save dialog + real filesystem path, so
  // "show in folder" can actually work (see main.cjs for why the browser's
  // File System Access API can't do this).
  startRecordingSave: (suggestedName) => ipcRenderer.invoke("recording:start-save", suggestedName),
  writeRecordingChunk: (token, arrayBuffer) => ipcRenderer.invoke("recording:write-chunk", token, arrayBuffer),
  closeRecordingFile: (token) => ipcRenderer.invoke("recording:close", token),
  showItemInFolder: (filePath) => ipcRenderer.invoke("recording:show-in-folder", filePath),

  // Per-class OS-level app allow-list enforcement (broadcast sessions only).
  // See Frontend/electron/main.cjs's app-guard IPC handlers for the actual
  // process enumeration/kill logic — this is just the bridge.
  startAppGuard: (allowList) => ipcRenderer.invoke("app-guard:start", allowList),
  stopAppGuard: () => ipcRenderer.invoke("app-guard:stop"),
  onAppViolation: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app-guard:violation", listener);
    return () => ipcRenderer.removeListener("app-guard:violation", listener);
  },
});
