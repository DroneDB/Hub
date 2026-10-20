// The shell of the host (web or Electron, see dynamic/web), looked up when called: modules
// that import this one may load before the host registers it
module.exports = {
    openItem: (...args) => window.__shell.openItem(...args),
    showItemInFolder: (...args) => window.__shell.showItemInFolder(...args)
};
