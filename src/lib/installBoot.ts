/**
 * Chrome/Android fire `beforeinstallprompt` early, sometimes before React mounts,
 * so an inline <head> script stashes it on window for us.
 */
export const INSTALL_BOOT_SCRIPT =
  "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__e0install=e;dispatchEvent(new Event('e0:installable'))});";
