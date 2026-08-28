export function installPwa({ mode, device, reflect = "" }) {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) {
    const query = new URLSearchParams({ device });
    if (reflect) query.set("reflect", reflect);
    manifest.href = `/api/manifest/${mode}?${query}`;
  }
  if ("serviceWorker" in navigator && isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => {});
  document.documentElement.classList.toggle("standalone", Boolean(navigator.standalone || matchMedia("(display-mode: standalone)").matches));
}
