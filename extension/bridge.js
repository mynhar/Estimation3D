// Corre en la página de Estimation3D: le dice a la app que la extensión está
// instalada, envía el estado de la grabación al service worker y devuelve a la
// app los clics de la burbuja.
//
// Protocolo (window.postMessage, mismo origen):
//   app → extensión  { source: 'e3d-app', type: 'ping' | 'state', state }
//   extensión → app  { source: 'e3d-ext', type: 'hello' | 'cmd', cmd }
(() => {
  if (window.__e3dBridge) return;
  window.__e3dBridge = true;

  const toPage = (msg) => window.postMessage({ source: 'e3d-ext', ...msg }, location.origin);
  const toWorker = (msg) => {
    if (chrome.runtime?.id) chrome.runtime.sendMessage(msg).catch(() => {});
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'e3d-app') return;
    if (e.data.type === 'ping') toPage({ type: 'hello' });
    if (e.data.type === 'state') toWorker({ type: 'state', state: e.data.state });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'cmd') toPage({ type: 'cmd', cmd: msg.cmd });
  });

  window.addEventListener('pagehide', () => toWorker({ type: 'state', state: null }));
  toPage({ type: 'hello' });
})();
