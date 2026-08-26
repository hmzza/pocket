const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pocketDesktop", {
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  getPrinters: () => ipcRenderer.invoke("desktop:get-printers"),
  setPrinter: (printerName) => ipcRenderer.invoke("desktop:set-printer", printerName),
  printReceipt: (request) => ipcRenderer.invoke("desktop:print-receipt", request),
  printCurrentReceipt: () => ipcRenderer.invoke("desktop:print-current-receipt"),
  receiptReady: () => ipcRenderer.send("desktop:receipt-ready")
});
