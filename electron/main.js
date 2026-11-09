import { app, BrowserWindow, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 700,
    title: "MealPlan",
    backgroundColor: "#F3FBF6",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "..", "src", "index.html"));
  win.on("closed", () => {
    win = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    app.quit();
  });
}
