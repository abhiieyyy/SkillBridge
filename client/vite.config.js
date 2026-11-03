import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend runs on port 5001 (port 5000 is used by AirPlay on macOS)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5001',
      '/socket.io': { target: 'http://localhost:5001', ws: true },
    },
  },
});
