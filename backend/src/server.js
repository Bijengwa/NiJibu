require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env (see .env.example). Server not started.');
  process.exit(1);
}

const http = require('http');
const app = require('./app');
const realtime = require('./lib/realtime');
const dispatch = require('./services/dispatch');

const port = process.env.PORT || 3000;
const server = http.createServer(app);
realtime.init(server); // live updates (Socket.IO) share the same port

server.listen(port, () => console.log(`API listening on http://localhost:${port}`));

// Matching clock: expires old offers, sends new ones, widens the search
setInterval(() => dispatch.tick().catch((err) => console.error('dispatch tick failed:', err.message)), 5000);
