import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: env.VITE_API_BASE_URL
      ? {
          proxy: {
            '/api': {
              target: env.VITE_API_BASE_URL,
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
            },
          },
        }
      : undefined,
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
