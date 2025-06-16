import { app, BrowserWindow, ipcMain} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';


// --- SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store({ defaults: { states: {}, lastState: '' } });

// --- IPC EVENT HANDLERS ---
ipcMain.on('store-get', async (event, val) => {
  event.returnValue = event.returnValue = store.get(val);
});

ipcMain.on('store-set', async (event, key, val) => {
  store.set(key, val);
});

ipcMain.on('save-state', async (event, states, lastState) => {
    store.set('states', states);
    store.set('lastState', lastState);
});

ipcMain.on('get-state-names', async (event) => {
    event.returnValue = Object.keys(store.get('states'));
});

ipcMain.on('get-state', async (event, name) => {
    event.returnValue = store.get('states')[name] || [];
});;

ipcMain.on('get-last-state', async (event) => {
    event.returnValue = store.get('lastState');
});

ipcMain.on('create-url-from-path', async (event, filePath) => {
    let resolvedPath = path.resolve(filePath);
    // On Windows, replace backslashes with forward slashes and add extra slash
    if (process.platform === 'win32') {
        resolvedPath = '/' + resolvedPath.replace(/\\/g, '/');
    }
    event.returnValue = encodeURI('file://' + resolvedPath);
})

// --- INITIALIZATION ---
//store.clear(); for DEBUG

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 900,

        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });
    win.loadFile('index.html');
}

app.commandLine.appendSwitch('ozone-platform', 'wayland');
app.commandLine.appendSwitch('gtk-version', '3');

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});