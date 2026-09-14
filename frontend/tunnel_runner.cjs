const { spawn } = require('child_process');
const fs = require('fs');

console.log('Starting persistent SSH tunnel to localhost.run...');

function startTunnel() {
  const child = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=999',
    '-R', '80:localhost:5173',
    'nokey@localhost.run'
  ]);

  child.stdout.on('data', (data) => {
    const str = data.toString();
    console.log(str);
    const match = str.match(/https:\/\/[a-zA-Z0-9.\-]+\.lhr\.life/);
    if (match) {
      const url = match[0];
      fs.writeFileSync('d:/SIH/active_tunnel_url.txt', url);
      console.log('ACTIVE_TUNNEL_URL:', url);
    }
  });

  child.stderr.on('data', (data) => {
    const str = data.toString();
    console.error(str);
    const match = str.match(/https:\/\/[a-zA-Z0-9.\-]+\.lhr\.life/);
    if (match) {
      const url = match[0];
      fs.writeFileSync('d:/SIH/active_tunnel_url.txt', url);
      console.log('ACTIVE_TUNNEL_URL:', url);
    }
  });

  child.on('close', (code) => {
    console.log(`Tunnel closed with code ${code}, restarting in 2 seconds...`);
    setTimeout(startTunnel, 2000);
  });
}

startTunnel();
