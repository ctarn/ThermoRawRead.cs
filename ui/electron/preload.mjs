import electron from "electron";
import os from "node:os";
import path from "node:path";

const {contextBridge, ipcRenderer} = electron;

contextBridge.exposeInMainWorld("commandbus", {
    env: {
        homeDir: os.homedir(),
        pathSep: path.sep
    },
    invoke(command, payload = {}) {
        return ipcRenderer.invoke(command, payload);
    },
    on(eventName, handler) {
        const listener = (_event, payload) => handler(payload);
        ipcRenderer.on(eventName, listener);
        return () => ipcRenderer.removeListener(eventName, listener);
    }
});
