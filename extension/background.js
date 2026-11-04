// Hace de relevo entre la página de Estimation3D (bridge.js) y las burbujas
// (bubble.js). El estado de la grabación vive en chrome.storage.local bajo
// `rec`, así cada pestaña redibuja su burbuja desde storage.onChanged.

const APP_URL = /^(http:\/\/(localhost|127\.0\.0\.1)[:/]|https:\/\/([\w-]+\.)*estimation3d\.com[:/])/;

const clear = () => chrome.storage.local.set({ rec: null, recTab: null });

async function sendCommand(cmd) {
  const { recTab } = await chrome.storage.local.get('recTab');
  if (recTab == null) return;
  // Sin receptor, la pestaña de la app se cerró o se recargó: fuera la burbuja.
  chrome.tabs.sendMessage(recTab, { type: 'cmd', cmd }).catch(clear);
}

// Los estados se aplican de uno en uno: un «saving» → null rápido no puede
// llegar desordenado.
let stateQueue = Promise.resolve();

async function applyState(state, tabId) {
  if (state) return chrome.storage.local.set({ rec: state, recTab: tabId });
  // Que se cierre otra pestaña de la app no borra el estado de la que graba.
  const { recTab } = await chrome.storage.local.get('recTab');
  if (recTab === tabId) return clear();
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'state') {
    stateQueue = stateQueue.then(() => applyState(msg.state, sender.tab?.id)).catch(() => {});
  }
  if (msg.type === 'cmd') sendCommand(msg.cmd);
  if (msg.type === 'permission') chrome.tabs.create({ url: 'permission.html' });
});

chrome.action.onClicked.addListener(() => sendCommand('cam'));

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { recTab } = await chrome.storage.local.get('recTab');
  if (tabId === recTab) clear();
});

chrome.runtime.onStartup.addListener(clear);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  clear();
  // Los content scripts sólo llegan a las páginas cargadas después de instalar:
  // se inyectan en las pestañas que ya estaban abiertas.
  for (const tab of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    const files = APP_URL.test(tab.url) ? ['bubble.js', 'bridge.js'] : ['bubble.js'];
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files }).catch(() => {});
  }
  if (reason === 'install') chrome.tabs.create({ url: 'permission.html' });
});
