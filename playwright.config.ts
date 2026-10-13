import { defineConfig } from '@playwright/test';

/**
 * Testes de navegador real (CSS, responsividade, persistência). Usam o Chrome instalado
 * na máquina (channel "chrome"): não baixam navegadores. Rodar: npm run test:e2e
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
