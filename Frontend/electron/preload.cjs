const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getWindowsUsername: () => ipcRenderer.invoke("get-windows-username"),
});
