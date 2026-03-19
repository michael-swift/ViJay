// Image + video texture pool management
window.VJ = window.VJ || {};

VJ.images = (function() {
  const textures = {};       // filename -> THREE.Texture or THREE.VideoTexture
  const videos = {};         // filename -> HTMLVideoElement (for video files only)
  let imageList = [];        // current filenames (images + videos)
  let currentIndex = 0;
  let secondIndex = -1;      // -1 = no second source; >= 0 = layer this on top
  let loader = null;         // THREE.TextureLoader, set after Three.js is ready

  const VIDEO_EXTS = /\.(mp4|webm|mov)$/i;

  function init(textureLoader) {
    loader = textureLoader;
  }

  function isVideo(filename) {
    return VIDEO_EXTS.test(filename);
  }

  // Load a video file: create a <video> element, wrap in VideoTexture
  function loadVideo(filename) {
    if (textures[filename]) return textures[filename];

    const video = document.createElement('video');
    video.src = `/images/${filename}`;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;          // must be muted for autoplay
    video.playsInline = true;
    video.preload = 'auto';
    video.style.display = 'none';
    document.body.appendChild(video);

    // VideoTexture reads frames from the <video> element each render tick
    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    videos[filename] = video;
    textures[filename] = tex;
    console.log(`[images] loaded video: ${filename}`);
    return tex;
  }

  // Load a static image
  function loadImage(filename) {
    if (textures[filename]) return textures[filename];

    if (isVideo(filename)) return loadVideo(filename);

    const tex = loader.load(`/images/${filename}`, () => {
      console.log(`[images] loaded: ${filename}`);
    });
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    textures[filename] = tex;
    return tex;
  }

  // When the current source changes, play/pause the right videos.
  // Keep videos playing if they're either the primary OR secondary source.
  function updateVideoPlayback() {
    const primaryFile = imageList[currentIndex];
    const secondFile = secondIndex >= 0 ? imageList[secondIndex] : null;
    Object.keys(videos).forEach(name => {
      if (name === primaryFile || name === secondFile) {
        videos[name].play().catch(() => {});
      } else {
        videos[name].pause();
      }
    });
  }

  // Update the image list (called on WS messages)
  function setImageList(images) {
    imageList = images;
    // Preload all
    images.forEach(loadImage);
    // Evict removed entries
    Object.keys(textures).forEach(name => {
      if (!images.includes(name)) {
        textures[name].dispose();
        delete textures[name];
        if (videos[name]) {
          videos[name].pause();
          videos[name].remove();
          delete videos[name];
        }
      }
    });
  }

  function setCurrentIndex(idx) {
    currentIndex = Math.max(0, Math.min(imageList.length - 1, idx));
    updateVideoPlayback();
  }

  function getCurrentTexture() {
    if (imageList.length === 0) return null;
    const filename = imageList[currentIndex];
    return textures[filename] || null;
  }

  function nextImage() {
    if (imageList.length === 0) return;
    currentIndex = (currentIndex + 1) % imageList.length;
    updateVideoPlayback();
  }

  function prevImage() {
    if (imageList.length === 0) return;
    currentIndex = (currentIndex - 1 + imageList.length) % imageList.length;
    updateVideoPlayback();
  }

  function getCurrentName() {
    return imageList[currentIndex] || '-';
  }

  function getCount() {
    return imageList.length;
  }

  function selectSlot(slot) {
    if (imageList.length === 0) return;
    const step = Math.max(1, Math.floor(imageList.length / 4));
    currentIndex = (slot * step) % imageList.length;
    updateVideoPlayback();
  }

  function getSlotIndex(slot) {
    if (imageList.length === 0) return 0;
    const step = Math.max(1, Math.floor(imageList.length / 4));
    return (slot * step) % imageList.length;
  }

  function getSecondTexture() {
    if (secondIndex < 0 || imageList.length === 0) return null;
    const filename = imageList[secondIndex];
    return textures[filename] || null;
  }

  function getSecondName() {
    if (secondIndex < 0) return '-';
    return imageList[secondIndex] || '-';
  }

  function setSecondIndex(idx) {
    secondIndex = idx < 0 ? -1 : Math.max(0, Math.min(imageList.length - 1, idx));
    updateVideoPlayback();
  }

  // Cycle through second source with T/Y keys
  function nextSecond() {
    if (imageList.length === 0) return;
    if (secondIndex < 0) { secondIndex = 0; }
    else { secondIndex = (secondIndex + 1) % imageList.length; }
    // Skip if same as primary
    if (secondIndex === currentIndex) secondIndex = (secondIndex + 1) % imageList.length;
    updateVideoPlayback();
  }

  function prevSecond() {
    if (imageList.length === 0) return;
    if (secondIndex < 0) { secondIndex = imageList.length - 1; }
    else { secondIndex = (secondIndex - 1 + imageList.length) % imageList.length; }
    if (secondIndex === currentIndex) secondIndex = (secondIndex - 1 + imageList.length) % imageList.length;
    updateVideoPlayback();
  }

  function clearSecond() {
    secondIndex = -1;
    updateVideoPlayback();
  }

  function hasSecond() {
    return secondIndex >= 0;
  }

  // Ensure a video is playing by filename (called by engine for panel sources)
  function ensurePlaying(filename) {
    if (videos[filename] && videos[filename].paused) {
      videos[filename].play().catch(() => {});
    }
  }

  function getTextureByIndex(idx) {
    if (idx < 0 || idx >= imageList.length) return null;
    const filename = imageList[idx];
    return textures[filename] || null;
  }

  function getNameByIndex(idx) {
    if (idx < 0 || idx >= imageList.length) return '-';
    return imageList[idx];
  }

  function getIndexByName(name) {
    return imageList.indexOf(name);
  }

  function getList() {
    return imageList;
  }

  return { init, setImageList, setCurrentIndex, getCurrentTexture, nextImage, prevImage, getCurrentName, getCount, selectSlot, getSlotIndex, getSecondTexture, getSecondName, setSecondIndex, nextSecond, prevSecond, clearSecond, hasSecond, getTextureByIndex, getNameByIndex, getIndexByName, getList, ensurePlaying };
})();
