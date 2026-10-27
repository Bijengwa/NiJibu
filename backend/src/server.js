require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env (see .env.example). Server not started.');
  process.exit(1);
}

const app = require('./app');

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
