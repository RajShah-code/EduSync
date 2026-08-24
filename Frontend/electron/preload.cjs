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
});
