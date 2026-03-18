// Chain of Thought overlay — shows agent reasoning on screen
window.VJ = window.VJ || {};

VJ.cot = (function() {
  const container = document.getElementById('cot');
  const MAX_LINES = 12;
  const FADE_AFTER = 8000; // ms before a line starts fading
  let lines = [];
  let visible = true;

  // Add a line of text to the overlay
  // type: 'thought' (gray italic), 'action' (cyan), 'default' (green)
  function addLine(text, type) {
    if (!visible) return;

    const el = document.createElement('div');
    el.className = 'line' + (type === 'thought' ? ' thinking' : type === 'action' ? ' action' : '');

    // Add a prefix character based on type
    const prefix = document.createElement('span');
    prefix.className = 'prefix';
    prefix.textContent = type === 'thought' ? '  ' : type === 'action' ? '> ' : '  ';
    el.appendChild(prefix);
    el.appendChild(document.createTextNode(text));

    container.appendChild(el);
    lines.push({ el, time: Date.now() });

    // Remove excess lines
    while (lines.length > MAX_LINES) {
      const old = lines.shift();
      old.el.remove();
    }

    // Schedule fade
    setTimeout(() => {
      el.classList.add('fading');
      setTimeout(() => {
        el.remove();
        lines = lines.filter(l => l.el !== el);
      }, 2000);
    }, FADE_AFTER);
  }

  function toggle() {
    visible = !visible;
    container.style.display = visible ? 'flex' : 'none';
  }

  function isVisible() { return visible; }

  // Listen for CoT messages from server
  VJ.connection.on('cot', (msg) => {
    if (msg.text) addLine(msg.text, msg.style || 'default');
    // Support multiple lines in one message
    if (msg.lines) {
      msg.lines.forEach(l => {
        if (typeof l === 'string') addLine(l, 'default');
        else addLine(l.text, l.style || 'default');
      });
    }
  });

  return { addLine, toggle, isVisible };
})();
