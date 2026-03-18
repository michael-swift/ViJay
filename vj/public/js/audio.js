// Web Audio FFT + beat detection
window.VJ = window.VJ || {};

VJ.audio = (function() {
  let ctx = null;
  let analyser = null;
  let dataArray = null;
  let active = false;

  // Frequency band energies (0-1 normalized)
  let bass = 0, mid = 0, high = 0, overall = 0;

  // Beat detection state
  let beatThreshold = 1.5;       // how much bass must exceed average to count as beat
  let beatDecay = 0.95;          // how fast beat pulse decays
  let beatPulse = 0;             // current beat pulse value (0-1)
  let bassHistory = [];          // rolling history for average
  const HISTORY_SIZE = 30;

  async function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const source = ctx.createMediaStreamSource(stream);

      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      dataArray = new Uint8Array(analyser.frequencyBinCount);
      active = true;
      console.log('[audio] mic connected, FFT size:', analyser.fftSize);
    } catch (e) {
      console.warn('[audio] mic access denied or unavailable:', e.message);
      active = false;
    }
  }

  function update() {
    if (!active || !analyser) return;

    analyser.getByteFrequencyData(dataArray);
    const bins = dataArray.length; // 256 bins for fftSize=512

    // Split into bands: bass (0-10%), mid (10-40%), high (40-100%)
    const bassEnd = Math.floor(bins * 0.1);
    const midEnd = Math.floor(bins * 0.4);

    let bassSum = 0, midSum = 0, highSum = 0;
    for (let i = 0; i < bins; i++) {
      const v = dataArray[i] / 255;
      if (i < bassEnd) bassSum += v;
      else if (i < midEnd) midSum += v;
      else highSum += v;
    }

    bass = bassSum / bassEnd;
    mid = midSum / (midEnd - bassEnd);
    high = highSum / (bins - midEnd);
    overall = (bass + mid + high) / 3;

    // Beat detection: spike in bass relative to recent average
    bassHistory.push(bass);
    if (bassHistory.length > HISTORY_SIZE) bassHistory.shift();

    const avgBass = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;
    if (bass > avgBass * beatThreshold && bass > 0.3) {
      beatPulse = 1.0;
    }

    // Decay the beat pulse
    beatPulse *= beatDecay;
    if (beatPulse < 0.01) beatPulse = 0;
  }

  // Manual beat trigger (space bar)
  function triggerBeat() {
    beatPulse = 1.0;
  }

  function getBass() { return bass; }
  function getMid() { return mid; }
  function getHigh() { return high; }
  function getOverall() { return overall; }
  function getBeat() { return beatPulse; }
  function isActive() { return active; }

  return { init, update, triggerBeat, getBass, getMid, getHigh, getOverall, getBeat, isActive };
})();
