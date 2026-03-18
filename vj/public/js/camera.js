// Camera feed management — webcam/phone via getUserMedia
window.VJ = window.VJ || {};

VJ.camera = (function() {
  let video = null;
  let texture = null;
  let active = false;
  let enabled = false;
  let blend = 0.0; // 0 = folder image only, 1 = camera only

  async function init() {
    // Create hidden video element
    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.muted = true;
    video.style.display = 'none';
    document.body.appendChild(video);
  }

  async function start() {
    if (active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();

      // Create Three.js video texture
      texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      active = true;
      enabled = true;
      console.log('[camera] started');
    } catch (e) {
      console.warn('[camera] access denied or unavailable:', e.message);
      active = false;
    }
  }

  function stop() {
    if (!active) return;
    const stream = video.srcObject;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    video.srcObject = null;
    if (texture) {
      texture.dispose();
      texture = null;
    }
    active = false;
    enabled = false;
    console.log('[camera] stopped');
  }

  function toggle() {
    if (active) stop();
    else start();
  }

  function getTexture() {
    return active ? texture : null;
  }

  function setBlend(v) { blend = Math.max(0, Math.min(1, v)); }
  function getBlend() { return blend; }
  function isEnabled() { return enabled; }
  function setEnabled(v) {
    enabled = v;
    if (v && !active) start();
    if (!v && active) stop();
  }

  return { init, start, stop, toggle, getTexture, setBlend, getBlend, isEnabled, setEnabled };
})();
