const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    get: (key) => ipcRenderer.sendSync('store-get', key),
    set: (key, value) => ipcRenderer.send('store-set', key, value),
    // Save the state of the collage (images) under a given name
    saveState: (name, images) => {
        const states = ipcRenderer.sendSync('store-get', 'states');
        const lastState = name;
        states[name] = images;
        ipcRenderer.send('save-state', states, lastState);
    },
    // Get a list of saved states
    getStateNames: () => ipcRenderer.sendSync('get-state-names'),
    // Get the images from a saved state by name
    getState: (name) => ipcRenderer.sendSync('get-state', name),
    // Get the last saved state
    getLastState: () => ipcRenderer.sendSync('get-last-state'),
    // get the full path of a file
    //getPath: (file) => file.path,
    //getPath: (file) => ipcRenderer.sendSync('get-path', file),
    getPath: (file) => webUtils.getPathForFile(file),
    createUrlFromPath: (filePath) => ipcRenderer.sendSync('create-url-from-path', filePath),
    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximize: () => ipcRenderer.send('window-maximize'),
    windowClose: () => ipcRenderer.send('window-close'),
});


