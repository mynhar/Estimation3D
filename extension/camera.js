// Corre dentro del iframe de la burbuja, con el origen de la extensión: así la
// cámara usa el permiso concedido una vez (permission.html) en vez de pedirlo
// en cada sitio. Los ids de dispositivo cambian por origen, por eso la cámara
// elegida en la app se busca por su etiqueta.
const label = new URLSearchParams(location.search).get('label');
const video = document.querySelector('video');
const report = (error) => parent.postMessage({ source: 'e3d-cam', error }, '*');
const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

async function openCamera() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const match = label && devices.find((d) => d.kind === 'videoinput' && d.label === label);
  if (match) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { ...base, deviceId: { exact: match.deviceId } } });
    } catch {}
  }
  return navigator.mediaDevices.getUserMedia({ video: base });
}

function errorCode(err) {
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  if (policy && !policy.allowsFeature('camera')) return 'blocked';
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return 'permission';
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'missing';
  return 'busy';
}

openCamera()
  .then((stream) => { video.srcObject = stream; report(null); })
  .catch((err) => report(errorCode(err)));
