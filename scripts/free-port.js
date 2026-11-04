// Frees a TCP port before a dev server starts, by stopping an old Node process that still holds it
// (e.g. a terminal window that was closed while "npm run dev" was running).
//   node ../scripts/free-port.js 3000
// Only Node processes are stopped. If something else holds the port, it is reported and left alone.
const { execSync } = require('child_process');

const port = Number(process.argv[2]);
if (!port) {
  console.error('usage: node free-port.js <port>');
  process.exit(1);
}

const run = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return ''; // command found nothing
  }
};

function listeningPids() {
  if (process.platform === 'win32') {
    const pids = new Set();
    // Get-NetTCPConnection also sees sockets stuck in the "Bound" state, which netstat does not list
    const ps = run(`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object { $_.State -ne 'TimeWait' }).OwningProcess"`);
    for (const pid of ps.split(/\s+/)) if (/^\d+$/.test(pid)) pids.add(pid);
    for (const line of run('netstat -ano').split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      // Proto  Local Address  Foreign Address  State  PID
      if (cols[0] === 'TCP' && cols[3] === 'LISTENING' && cols[1].endsWith(`:${port}`)) pids.add(cols[4]);
    }
    return [...pids].filter((pid) => pid !== '0');
  }
  return run(`lsof -ti tcp:${port} -sTCP:LISTEN`).split(/\s+/).filter(Boolean);
}

function processName(pid) {
  if (process.platform === 'win32') {
    const out = run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`).trim();
    return (out.match(/^"([^"]+)"/) || [])[1] || '';
  }
  return run(`ps -p ${pid} -o comm=`).trim();
}

for (const pid of listeningPids()) {
  if (Number(pid) === process.pid) continue;
  const name = processName(pid);
  if (!/node/i.test(name)) {
    console.warn(`Port ${port} is used by ${name || 'another program'} (PID ${pid}); not stopping it.`);
    continue;
  }
  if (process.platform === 'win32') run(`taskkill /PID ${pid} /T /F`);
  else run(`kill -9 ${pid}`);
  console.log(`Stopped old ${name} (PID ${pid}) that was holding port ${port}.`);
}
