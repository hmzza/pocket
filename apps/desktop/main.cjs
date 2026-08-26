const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");

const packageMetadata = require("./package.json");
const mode = process.env.POCKET_DESKTOP_MODE ?? packageMetadata.pocketDesktopMode ?? "pos";
const desktopMode = mode === "admin" ? "admin" : "pos";
const productName = desktopMode === "admin" ? "Pocket Admin" : "Pocket POS";
const initialPath = desktopMode === "admin" ? "/admin" : "/pos";
const partition = `persist:pocket-${desktopMode}`;
const preloadPath = path.join(__dirname, "preload.cjs");
let deliveryAlarmProcess = null;

function getBaseUrl() {
  const value = process.env.POCKET_DESKTOP_URL ?? "https://pocketpakistan.com";
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("POCKET_DESKTOP_URL must use HTTPS, localhost, or 127.0.0.1.");
  }
  return url;
}

const baseUrl = getBaseUrl();

function isPocketUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === baseUrl.origin;
  } catch {
    return false;
  }
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

function createWindow(urlPath = initialPath, options = {}) {
  const window = new BrowserWindow({
    title: productName,
    width: options.width ?? 1440,
    height: options.height ?? 940,
    minWidth: options.minWidth ?? 960,
    minHeight: options.minHeight ?? 680,
    show: options.show ?? true,
    autoHideMenuBar: true,
    backgroundColor: "#f4efe5",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isPocketUrl(url)) {
      createWindow(new URL(url).pathname + new URL(url).search, { width: 500, height: 820 });
    } else {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isPocketUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void window.loadURL(new URL(urlPath, baseUrl).toString());
  return window;
}

function printWebContents(webContents) {
  const { printerName } = getSettings();
  return new Promise((resolve, reject) => {
    webContents.print(
      {
        silent: true,
        printBackground: true,
        margins: { marginType: "none" },
        ...(printerName ? { deviceName: printerName } : {})
      },
      (success, failureReason) => {
        if (success) {
          resolve({ success: true });
          return;
        }
        reject(new Error(failureReason || "The receipt could not be printed."));
      }
    );
  });
}

function stopNativeDeliveryAlarm() {
  if (!deliveryAlarmProcess) return { playing: false };
  deliveryAlarmProcess.kill();
  deliveryAlarmProcess = null;
  return { playing: false };
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.channel = desktopMode;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("error", (error) => {
    // Updates are optional; a temporary network or release error must never interrupt POS work.
    console.warn("Pocket desktop update check failed:", error.message);
  });
  autoUpdater.on("update-downloaded", async (updateInfo) => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart and update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: `${productName} update ready`,
      message: `Version ${updateInfo.version} has downloaded.`,
      detail: "Restart now to install the update, or choose Later to keep working."
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => null);
  }, 8_000);
}

function startNativeDeliveryAlarm() {
  if (deliveryAlarmProcess && deliveryAlarmProcess.exitCode === null) return { playing: true };

  if (process.platform === "win32") {
    deliveryAlarmProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        "while ($true) { [System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 800; [System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Seconds 2 }"
      ],
      { windowsHide: true, stdio: "ignore" }
    );
  } else if (process.platform === "darwin") {
    deliveryAlarmProcess = spawn(
      "/bin/sh",
      ["-c", "while true; do /usr/bin/afplay /System/Library/Sounds/Glass.aiff; sleep 1; done"],
      { stdio: "ignore" }
    );
  } else {
    deliveryAlarmProcess = spawn(
      "/bin/sh",
      ["-c", "while true; do (paplay /usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga || printf '\\a'); sleep 1; done"],
      { stdio: "ignore" }
    );
  }

  const alarmProcess = deliveryAlarmProcess;
  alarmProcess.once("exit", () => {
    if (deliveryAlarmProcess === alarmProcess) deliveryAlarmProcess = null;
  });
  deliveryAlarmProcess.unref();
  return { playing: true };
}

function isValidReceiptRequest(value) {
  return Boolean(
    value &&
      typeof value.orderId === "string" &&
      /^[a-zA-Z0-9_-]+$/.test(value.orderId) &&
      ["all", "chef", "store", "store-chef"].includes(value.copy)
  );
}

const pendingReceipts = new Map();

function printReceipt(request) {
  if (!isValidReceiptRequest(request)) {
    return Promise.reject(new Error("Invalid receipt print request."));
  }

  const receiptPath = `/pos/receipt/${encodeURIComponent(request.orderId)}?copy=${encodeURIComponent(request.copy)}&desktopPrint=1`;
  const receiptWindow = createWindow(receiptPath, { show: false, width: 360, height: 900, minWidth: 360, minHeight: 600 });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingReceipts.delete(receiptWindow.webContents.id);
      if (!receiptWindow.isDestroyed()) receiptWindow.close();
      reject(new Error("The receipt did not finish loading in time."));
    }, 30_000);

    pendingReceipts.set(receiptWindow.webContents.id, { receiptWindow, resolve, reject, timeout });
    receiptWindow.on("closed", () => {
      const job = pendingReceipts.get(receiptWindow.webContents.id);
      if (!job) return;
      clearTimeout(job.timeout);
      pendingReceipts.delete(receiptWindow.webContents.id);
      job.reject(new Error("The receipt window was closed before printing."));
    });
  });
}

function configureSession() {
  const appSession = session.fromPartition(partition);
  const allowNotification = (_webContents, permission, callback) => callback(permission === "notifications");
  appSession.setPermissionRequestHandler(allowNotification);
  appSession.setPermissionCheckHandler((_webContents, permission) => permission === "notifications");
}

app.whenReady().then(() => {
  app.setName(productName);
  configureSession();
  createWindow();
  configureAutoUpdates();

  ipcMain.handle("desktop:get-app-info", () => ({ mode: desktopMode, productName, version: app.getVersion() }));

  ipcMain.handle("desktop:get-printers", async (event) => {
    const printers = await event.sender.getPrintersAsync();
    const { printerName } = getSettings();
    return {
      selectedPrinter: printerName ?? "",
      printers: printers.map((printer) => ({ name: printer.name, displayName: printer.displayName, isDefault: printer.isDefault, status: printer.status }))
    };
  });

  ipcMain.handle("desktop:set-printer", async (event, printerName) => {
    if (typeof printerName !== "string") throw new Error("Invalid printer.");
    const printers = await event.sender.getPrintersAsync();
    if (printerName && !printers.some((printer) => printer.name === printerName)) {
      throw new Error("The selected printer is no longer available.");
    }
    saveSettings({ ...getSettings(), printerName });
    return { selectedPrinter: printerName };
  });

  ipcMain.handle("desktop:print-receipt", (_event, request) => printReceipt(request));
  ipcMain.handle("desktop:print-current-receipt", (event) => printWebContents(event.sender));
  ipcMain.handle("desktop:start-delivery-alarm", () => startNativeDeliveryAlarm());
  ipcMain.handle("desktop:stop-delivery-alarm", () => stopNativeDeliveryAlarm());

  ipcMain.on("desktop:receipt-ready", (event) => {
    const job = pendingReceipts.get(event.sender.id);
    if (!job) return;
    pendingReceipts.delete(event.sender.id);
    clearTimeout(job.timeout);
    void printWebContents(event.sender)
      .then((result) => {
        if (!job.receiptWindow.isDestroyed()) job.receiptWindow.close();
        job.resolve(result);
      })
      .catch((error) => {
        if (!job.receiptWindow.isDestroyed()) job.receiptWindow.close();
        job.reject(error);
      });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopNativeDeliveryAlarm();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopNativeDeliveryAlarm();
});
