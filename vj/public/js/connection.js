// WebSocket connection manager
window.VJ = window.VJ || {};

VJ.connection = (function() {
  let ws = null;
  let handlers = {};
  let reconnectTimer = null;

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => {
      console.log('[ws] connected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Fire registered handlers for this message type
        if (handlers[msg.type]) {
          handlers[msg.type].forEach(fn => fn(msg));
        }
        // Also fire catch-all handlers
        if (handlers['*']) {
          handlers['*'].forEach(fn => fn(msg));
        }
      } catch (e) {
        console.error('[ws] parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[ws] disconnected, reconnecting in 2s...');
      reconnectTimer = setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[ws] error:', err);
      ws.close();
    };
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function on(type, fn) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(fn);
  }

  connect();

  return { send, on };
})();
