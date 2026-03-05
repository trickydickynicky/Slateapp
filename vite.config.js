import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/nba': {
        target: 'https://stats.nba.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nba/, '/stats'),
        headers: {
          'Referer': 'https://www.nba.com',
          'Origin': 'https://www.nba.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'x-nba-stats-origin': 'stats',
          'x-nba-stats-token': 'true',
        },
      },
    },
  },
})