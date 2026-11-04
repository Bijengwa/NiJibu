require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env (see .env.example). Server not started.');
  process.exit(1);
}

const http = require('http');
const app = require('./app');
const realtime = require('./lib/realtime');
const dispatch = require('./services/dispatch');
const payments = require('./services/payments');

const port = process.env.PORT || 3000;
const server = http.createServer(app);
realtime.init(server); // live updates (Socket.IO) share the same port

server.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port} (all network addresses), e.g. http://192.168.111.163:${port}`));

// Matching clock: expires old offers, sends new ones, widens the search
setInterval(() => dispatch.tick().catch((err) => console.error('dispatch tick failed:', err.message)), 5000);

// Mobile-money payments that wait for the customer: ask the provider, close the old ones
setInterval(() => payments.reconcilePending().catch((err) => console.error('payment check failed:', err.message)), 20000);
