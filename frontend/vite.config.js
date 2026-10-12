import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'offline-asset-manifest',
      generateBundle(_options, bundle) {
        const assets = Object.values(bundle).filter(item => item.type === 'chunk' || item.fileName.endsWith('.css')).map(item => '/' + item.fileName);
        this.emitFile({ type: 'asset', fileName: 'offline-assets.json', source: JSON.stringify(assets) });
        const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 12);
        const worker = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8').replace('shell-v3', 'shell-' + version);
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker });
      },
    },
  ],
  server: {
    port: 5173,
    host: true,
    // Vite already permits localhost and IP addresses; opt in to named tunnels.
    allowedHosts: (process.env.VITE_ALLOWED_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean),
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
