import electron from "electron";

const {contextBridge, ipcRenderer} = electron;

contextBridge.exposeInMainWorld("commandbus", {
    invoke(command, payload = {}) {
        return ipcRenderer.invoke(command, payload);
    },
    on(eventName, handler) {
        const listener = (_event, payload) => handler(payload);
        ipcRenderer.on(eventName, listener);
        return () => ipcRenderer.removeListener(eventName, listener);
    }
});
