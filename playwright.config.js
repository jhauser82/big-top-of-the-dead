import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // WebGL + WASM boot is not fast; generous but not unbounded.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        // Headless Chromium needs a software rasteriser for WebGL. Without
        // these the context creation fails and every test dies at boot for
        // reasons that look nothing like the real cause.
        args: [
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--disable-gpu-sandbox',
        ],
      },
    },
  }],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
