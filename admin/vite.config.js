import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The admin runs on the network address, so other computers and phones on the Wi-Fi can open it:
//   http://192.168.111.163:5173/
// (localhost still works on this computer)
// /api is proxied to the backend on this computer, so the admin works from any address with no CORS or IP setup
const proxy = { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } }
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
})
