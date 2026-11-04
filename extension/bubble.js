// Dibuja la burbuja redonda de la cámara y los controles de grabación de
// Estimation3D encima de la página mientras hay una grabación activa. Sólo la
// dibujan las pestañas visibles, así la cámara (camera.html en un iframe) corre
// en una sola pestaña a la vez.
(() => {
  if (window.__e3dBubble) return;
  window.__e3dBubble = true;

  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const MIN_SIZE = 96;
  const MAX_SIZE = 480;

  // Iconos de trazo (line), como bootstrap-icons en la app.
  const paths = {
    cam: '<path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/>',
    camOff: '<path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/><path d="M3 3l18 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="M7 5.5v13l11-6.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

  // Copia de los tokens de src/styles/tokens.css (la extensión corre en otras
  // páginas y no puede leer los de la app).
  const CSS = `
:host{
  --ds-dark-surface:#2A2420; --ds-dark-surface-deep:#221E1A; --ds-ink-inverse:#FBFAF6; --ds-ink:#1A1A1A;
  --ds-gold:#D4B96E; --ds-gold-hover:#C2A85C; --ds-gold-active:#B0964A; --ds-danger-on-dark:#D47A76;
  --ds-shadow:0 12px 24px rgba(26,26,26,.18),0 4px 8px rgba(26,26,26,.12);
}
*{box-sizing:border-box}[hidden]{display:none!important}
.bubble{position:relative;width:var(--size,200px);height:var(--size,200px)}
.cam{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:var(--ds-dark-surface-deep);box-shadow:0 0 0 3px var(--ds-gold),var(--ds-shadow);cursor:grab;touch-action:none}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
.msg{position:absolute;inset:0;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16%;background:var(--ds-dark-surface);font-size:13px;line-height:1.4;text-align:center}
.tools{position:absolute;left:50%;top:-16px;transform:translateX(-50%);display:flex;gap:4px;padding:4px;border-radius:8px;background:var(--ds-dark-surface);box-shadow:var(--ds-shadow);opacity:0;transition:opacity .15s cubic-bezier(.16,1,.3,1)}
.bubble:hover .tools,.bubble:focus-within .tools{opacity:1}
.bar{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 14px;border-radius:12px;background:var(--ds-dark-surface);box-shadow:var(--ds-shadow);white-space:nowrap;cursor:grab;touch-action:none}
.dragging,.dragging .cam{cursor:grabbing}
.dot{width:10px;height:10px;border-radius:50%;background:var(--ds-danger-on-dark);animation:pulse 1.4s cubic-bezier(.65,0,.35,1) infinite}
.paused .dot,.saving .dot{animation:none;background:var(--ds-gold)}
@keyframes pulse{50%{opacity:.35}}
.time{min-width:38px;margin-right:4px;font:500 14px/1 "DM Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
button{all:unset;box-sizing:border-box;cursor:pointer;width:32px;height:32px;display:grid;place-items:center;border-radius:6px;background:rgba(251,250,246,.10);color:var(--ds-ink-inverse);transition:background-color .15s cubic-bezier(.16,1,.3,1)}
button:hover{background:rgba(251,250,246,.22)}
button:active{background:rgba(251,250,246,.30)}
button:focus-visible{outline:2px solid var(--ds-gold);outline-offset:2px}
button:disabled{opacity:.45;cursor:default}
.stop{background:var(--ds-gold);color:var(--ds-ink)}.stop:hover{background:var(--ds-gold-hover)}.stop:active{background:var(--ds-gold-active)}
.msg button{width:auto;height:auto;padding:8px 14px;background:var(--ds-gold);color:var(--ds-ink);font-weight:600}
.msg button:hover{background:var(--ds-gold-hover)}
.saving button{opacity:.45;pointer-events:none}
svg{width:16px;height:16px}
@media (prefers-reduced-motion:reduce){.dot{animation:none}.tools,button{transition:none}}`;

  // Textos de respaldo; la app manda los suyos (en el idioma del usuario) en `rec.labels`.
  const TEXTS = {
    fr: { pause: 'Pause', resume: 'Reprendre', stop: 'Terminer', camOn: 'Afficher la caméra', camOff: 'Masquer la caméra', saving: 'Enregistrement…', smaller: 'Plus petite', bigger: 'Plus grande', allow: 'Autoriser', bar: 'Commandes d\'enregistrement',
      permission: 'L\'extension n\'a pas l\'autorisation d\'utiliser la caméra.', blocked: 'Cette page ne permet pas d\'afficher la caméra.', missing: 'Caméra introuvable.', busy: 'Impossible d\'ouvrir la caméra.' },
    en: { pause: 'Pause', resume: 'Resume', stop: 'Finish', camOn: 'Show camera', camOff: 'Hide camera', saving: 'Saving…', smaller: 'Smaller', bigger: 'Bigger', allow: 'Allow', bar: 'Recording controls',
      permission: 'The extension isn\'t allowed to use the camera.', blocked: 'This page doesn\'t allow showing the camera.', missing: 'No camera found.', busy: 'Couldn\'t open the camera.' },
    es: { pause: 'Pausar', resume: 'Reanudar', stop: 'Terminar', camOn: 'Mostrar cámara', camOff: 'Ocultar cámara', saving: 'Guardando…', smaller: 'Más pequeña', bigger: 'Más grande', allow: 'Dar permiso', bar: 'Controles de grabación',
      permission: 'La extensión no tiene permiso para usar la cámara.', blocked: 'Esta página no permite mostrar la cámara.', missing: 'No se encontró la cámara.', busy: 'No se pudo abrir la cámara.' },
  };
  // El francés es el idioma por defecto de la app.
  const base = TEXTS[(navigator.language || 'fr').slice(0, 2)] ?? TEXTS.fr;
  const t = (key) => rec?.labels?.[key] ?? base[key];

  let rec = null;
  const place = { x: 24, b: 24, size: 200 };
  let host = null;
  let ui = null;
  let timer = 0;
  let saveTimer = 0;

  const alive = () => !!chrome.runtime?.id;
  const send = (msg) => { if (alive()) chrome.runtime.sendMessage(msg).catch(() => {}); };
  const save = () => { clearTimeout(saveTimer); if (alive()) chrome.storage.local.set({ bubble: { ...place } }); };
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };

  function fmt(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  function setBtn(button, name, label) {
    button.innerHTML = icon(name);
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('e3d-bubble');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:flex;flex-direction:column;align-items:center;gap:14px;'
      + 'font:500 14px/1 "DM Sans",ui-sans-serif,system-ui,sans-serif;color:#FBFAF6;user-select:none;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style>
      <div class="bubble">
        <div class="cam">
          <p class="msg" hidden><span></span><button type="button" data-act="permission" hidden></button></p>
        </div>
        <div class="tools">
          <button type="button" data-act="smaller"></button>
          <button type="button" data-act="bigger"></button>
          <button type="button" data-act="cam" class="tool-cam"></button>
        </div>
      </div>
      <div class="bar" role="toolbar">
        <span class="dot"></span><span class="time">0:00</span>
        <button type="button" data-act="pause"></button>
        <button type="button" data-act="stop" class="stop"></button>
        <button type="button" data-act="cam" class="cam-toggle"></button>
      </div>`;
    const $ = (sel) => root.querySelector(sel);
    ui = {
      bubble: $('.bubble'), cam: $('.cam'), bar: $('.bar'), time: $('.time'), pause: $('[data-act="pause"]'),
      stop: $('[data-act="stop"]'), smaller: $('[data-act="smaller"]'), bigger: $('[data-act="bigger"]'),
      toolCam: $('.tool-cam'), camToggle: $('.cam-toggle'), msg: $('.msg'), msgText: $('.msg span'),
      permission: $('[data-act="permission"]'), frame: null, label: null,
    };
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onPointerDown);
    ui.bubble.addEventListener('wheel', onWheel, { passive: false });
    // Que los atajos y los clics-fuera de la página no reaccionen a la burbuja.
    for (const type of ['click', 'pointerdown', 'mousedown', 'wheel', 'keydown']) host.addEventListener(type, (e) => e.stopPropagation());
    document.documentElement.append(host);
  }

  function unmount() {
    clearInterval(timer);
    timer = 0;
    host?.remove();
    host = ui = null;
  }

  function render() {
    if (!alive() || !rec || document.visibilityState !== 'visible') { unmount(); return; }
    mount();
    const camOn = !!rec.camVisible;
    ui.bubble.hidden = !camOn;
    if (camOn && (!ui.frame || ui.label !== rec.camLabel)) showCamera();
    if (!camOn && ui.frame) { ui.frame.remove(); ui.frame = null; showCamError(null); }
    const paused = rec.status === 'paused';
    setBtn(ui.pause, paused ? 'play' : 'pause', paused ? t('resume') : t('pause'));
    setBtn(ui.stop, 'stop', t('stop'));
    setBtn(ui.smaller, 'minus', t('smaller'));
    setBtn(ui.bigger, 'plus', t('bigger'));
    setBtn(ui.toolCam, 'camOff', t('camOff'));
    ui.bar.setAttribute('aria-label', t('bar'));
    ui.permission.textContent = t('allow');
    ui.pause.disabled = rec.status !== 'recording' && !paused;
    ui.bar.classList.toggle('paused', paused);
    ui.bar.classList.toggle('saving', rec.status === 'saving');
    ui.camToggle.hidden = !rec.camera;
    setBtn(ui.camToggle, camOn ? 'camOff' : 'cam', camOn ? t('camOff') : t('camOn'));
    clearInterval(timer);
    timer = rec.status === 'recording' ? setInterval(tick, 500) : 0;
    tick();
    position();
  }

  function tick() {
    if (!ui || !rec) return;
    const ms = Math.min(rec.elapsed + (rec.status === 'recording' ? Date.now() - rec.at : 0), rec.max || Infinity);
    ui.time.textContent = rec.status === 'saving' ? t('saving') : fmt(ms);
  }

  function showCamera() {
    ui.frame?.remove();
    const frame = document.createElement('iframe');
    frame.setAttribute('allow', 'camera');
    frame.src = `${chrome.runtime.getURL('camera.html')}?label=${encodeURIComponent(rec.camLabel)}`;
    ui.cam.prepend(frame);
    ui.frame = frame;
    ui.label = rec.camLabel;
    showCamError(null);
  }

  function showCamError(code) {
    ui.msg.hidden = !code;
    ui.msgText.textContent = code ? (base[code] || base.busy) : '';
    ui.permission.hidden = code !== 'permission';
  }

  // Anclada abajo a la izquierda: la barra no se mueve al ocultar la cámara.
  function position() {
    host.style.setProperty('--size', `${place.size}px`);
    const w = host.offsetWidth;
    const h = host.offsetHeight;
    place.x = Math.round(Math.min(innerWidth - w - 8, Math.max(8, place.x)));
    place.b = Math.round(Math.min(innerHeight - h - 8, Math.max(8, place.b)));
    host.style.left = `${place.x}px`;
    host.style.bottom = `${place.b}px`;
  }

  function resize(delta) {
    const before = host.offsetWidth;
    place.size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, place.size + delta));
    host.style.setProperty('--size', `${place.size}px`);
    place.x -= (host.offsetWidth - before) / 2;
    position();
    saveSoon();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'smaller') resize(-40);
    else if (act === 'bigger') resize(40);
    else if (act === 'permission') send({ type: 'permission' });
    else if (act) send({ type: 'cmd', cmd: act });
  }

  function onWheel(e) {
    e.preventDefault();
    resize(e.deltaY < 0 ? 16 : -16);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.target.closest('button') || !e.target.closest('.cam, .bar')) return;
    e.preventDefault();
    const el = host;
    const parts = [ui.bubble, ui.bar];
    const start = { px: e.clientX, py: e.clientY, x: place.x, b: place.b };
    el.setPointerCapture(e.pointerId);
    parts.forEach((p) => p.classList.add('dragging'));
    const move = (ev) => {
      place.x = start.x + ev.clientX - start.px;
      place.b = start.b - (ev.clientY - start.py);
      if (host === el) position();
    };
    const end = () => {
      parts.forEach((p) => p.classList.remove('dragging'));
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      save();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  window.addEventListener('message', (e) => {
    if (!ui?.frame || e.source !== ui.frame.contentWindow || e.origin !== EXT_ORIGIN || e.data?.source !== 'e3d-cam') return;
    showCamError(e.data.error);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(changes.rec || changes.bubble)) return;
    if (changes.rec) rec = changes.rec.newValue ?? null;
    if (changes.bubble) Object.assign(place, changes.bubble.newValue);
    render();
  });
  document.addEventListener('visibilitychange', render);
  window.addEventListener('resize', () => { if (host) position(); });

  chrome.storage.local.get(['rec', 'bubble']).then(({ rec: saved, bubble }) => {
    rec = saved ?? null;
    Object.assign(place, bubble);
    render();
  });
})();
