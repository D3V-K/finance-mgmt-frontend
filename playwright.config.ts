import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4173',
    env: {
      ...process.env,
      VITE_API_BASE_URL: '/api',
      VITE_USER_POOL_ID: 'ap-northeast-1_E2ETEST',
      VITE_USER_POOL_CLIENT_ID: 'e2e-test-client',
    },
    url: 'http://127.0.0.1:4173', reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
