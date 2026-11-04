const TEXTS = {
  fr: {
    title: 'Autorisez la caméra pour la bulle',
    body: 'Pendant un enregistrement dans Estimation3D, l\'extension affiche votre caméra dans une bulle ronde, sur n\'importe quel onglet. Chrome a besoin de votre autorisation une seule fois.',
    hint: 'Dans la fenêtre de Chrome, choisissez l\'option qui l\'autorise toujours, pas seulement cette fois.',
    allow: 'Autoriser la caméra',
    settings: 'Ouvrir les paramètres',
    granted: 'C\'est fait : la bulle peut afficher votre caméra. Vous pouvez fermer cet onglet.',
    denied: 'Chrome bloque la caméra pour l\'extension. Activez-la dans les paramètres, puis revenez sur cet onglet.',
    dismissed: 'L\'autorisation n\'a pas été accordée. Réessayez.',
    missing: 'Aucune caméra trouvée.',
  },
  en: {
    title: 'Allow the camera for the bubble',
    body: 'While you record in Estimation3D, the extension shows your camera in a round bubble on any tab. Chrome needs your permission once.',
    hint: 'In Chrome\'s prompt, choose the option that always allows it, not just this time.',
    allow: 'Allow camera',
    settings: 'Open settings',
    granted: 'Done: the bubble can now show your camera. You can close this tab.',
    denied: 'Chrome is blocking the camera for the extension. Allow it in the settings and come back to this tab.',
    dismissed: 'Permission wasn\'t granted. Try again.',
    missing: 'No camera found.',
  },
  es: {
    title: 'Permite la cámara para la burbuja',
    body: 'Mientras grabas en Estimation3D, la extensión muestra tu cámara en una burbuja redonda en cualquier pestaña. Chrome necesita tu permiso una vez.',
    hint: 'En el aviso de Chrome, elige la opción que lo permite siempre, no la de solo esta vez.',
    allow: 'Permitir cámara',
    settings: 'Abrir la configuración',
    granted: 'Listo: la burbuja ya puede mostrar tu cámara. Puedes cerrar esta pestaña.',
    denied: 'Chrome tiene bloqueada la cámara para la extensión. Actívala en la configuración y vuelve a esta pestaña.',
    dismissed: 'No se dio el permiso. Vuelve a intentarlo.',
    missing: 'No se encontró ninguna cámara.',
  },
};
const lang = (navigator.language || 'fr').slice(0, 2);
const t = TEXTS[lang] ?? TEXTS.fr;
document.documentElement.lang = TEXTS[lang] ? lang : 'fr';
document.title = `${t.allow} · Estimation3D`;
document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t[el.dataset.t]; });

const allow = document.getElementById('allow');
const settings = document.getElementById('settings');
const status = document.getElementById('status');

function show(state) {
  allow.hidden = state === 'granted';
  settings.hidden = state !== 'denied';
  status.textContent = t[state] ?? '';
  status.classList.toggle('is-error', state !== 'granted');
}

allow.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    show('granted');
  } catch (err) {
    if (err.name !== 'NotAllowedError') { show('missing'); return; }
    const { state } = await navigator.permissions.query({ name: 'camera' });
    show(state === 'denied' ? 'denied' : 'dismissed');
  }
});

settings.addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}` });
});

navigator.permissions.query({ name: 'camera' }).then((permission) => {
  if (permission.state !== 'prompt') show(permission.state);
  permission.onchange = () => show(permission.state);
});
