import { defineConfig, devices } from '@playwright/test'

const env = {
  ...process.env,
  VITE_API_BASE_URL: '/api',
  VITE_USER_POOL_ID: 'ap-northeast-1_E2ETEST',
  VITE_USER_POOL_CLIENT_ID: 'e2e-test-client',
}

// Two builds of the same app: the legacy-only deployment (no ledger flag) and a
// full-ledger deployment, so both rollout states stay covered.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'on-first-retry' },
  webServer: [
    { command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4173', env: { ...env, VITE_LEDGER_FEATURES: '' }, url: 'http://127.0.0.1:4173', reuseExistingServer: false },
    { command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4174', env: { ...env, VITE_LEDGER_FEATURES: 'all' }, url: 'http://127.0.0.1:4174', reuseExistingServer: false },
  ],
  projects: [
    { name: 'chromium', testIgnore: /ledger.*\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' } },
    { name: 'ledger', testMatch: /ledger.*\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' } },
  ],
})
