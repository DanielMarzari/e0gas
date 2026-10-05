/**
 * Chrome/Android fire `beforeinstallprompt` early, sometimes before React mounts,
 * so an inline <head> script stashes it on window for us. It also registers the
 * service worker, which Android needs before it will offer to install the app.
 */
export const INSTALL_BOOT_SCRIPT =
  "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__e0install=e;dispatchEvent(new Event('e0:installable'))});" +
  "if('serviceWorker'in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});";
