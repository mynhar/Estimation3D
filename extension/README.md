# Extensión de Chrome · burbuja de cámara (opcional)

Complemento del grabador de videos de presentación (`/admin/user/edit/:id`,
componente `app-grabador-video`).

Sin la extensión, al cambiar de pestaña durante una grabación la cámara y los
controles pasan a una ventana flotante (Picture-in-Picture), que siempre es
rectangular: una página web no puede dibujar nada redondo fuera de su pestaña.

Con la extensión instalada, la **burbuja redonda** y una **barra de controles**
(tiempo, pausar, terminar y cámara) se dibujan encima de cualquier pestaña. La
app la detecta sola (`postMessage` con `source: 'e3d-app' / 'e3d-ext'`) y deja
de usar la ventana flotante.

## Instalar (modo desarrollador)

1. Abrir `chrome://extensions` y activar **Modo de desarrollador**.
2. **Cargar descomprimida** → elegir esta carpeta `extension/`.
3. Se abre `permission.html`: permitir la cámara (opción «permitir siempre»).
4. Recargar la pestaña de Estimation3D.

## Dominios

`bridge.js` sólo se inyecta en la app: `localhost`, `127.0.0.1`,
`estimation3d.com` y sus subdominios (ver `manifest.json` y la expresión
`APP_URL` de `background.js`). Si la app se sirve desde otro dominio, añadirlo
en los dos sitios.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `bridge.js` | En la página de la app: responde al ping, reenvía el estado y devuelve los clics. |
| `background.js` | Service worker: guarda el estado en `chrome.storage.local` y enruta los comandos. |
| `bubble.js` | En todas las pestañas visibles: dibuja la burbuja y la barra (Shadow DOM). |
| `camera.html` / `camera.js` | Iframe de la burbuja con el origen de la extensión: abre la cámara con su propio permiso. |
| `permission.html` / `permission.js` | Pide el permiso de cámara una vez, al instalar. |

Basada en la extensión de «Capas» (mynhar.github.io/app-grabar-video-com).
