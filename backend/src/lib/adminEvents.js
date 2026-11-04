// Live "something changed" signal for the admin portal (Server-Sent Events, no extra package).
// The portal keeps one open connection. When data changes the server sends one small message and the
// portal reloads what it shows, so nobody has to refresh the page.
// If nobody is connected (tests, scripts) notify() does nothing.
const clients = new Set();
let timer = null;
let beat = null;

function add(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  if (!beat) {
    beat = setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 25000); // keeps proxies from closing it
    beat.unref();
  }
  res.on('close', () => {
    clients.delete(res);
    if (!clients.size && beat) {
      clearInterval(beat);
      beat = null;
    }
  });
}

// Many changes in a short time become one message
function notify() {
  if (!clients.size || timer) return;
  timer = setTimeout(() => {
    timer = null;
    const msg = `data: ${JSON.stringify({ at: Date.now() })}\n\n`;
    clients.forEach((c) => c.write(msg));
  }, 250);
  timer.unref();
}

module.exports = { add, notify };
