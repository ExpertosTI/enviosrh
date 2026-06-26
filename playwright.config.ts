import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5185',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 5185,
    reuseExistingServer: true,
  },
});
