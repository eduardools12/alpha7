import { defineConfig } from '@playwright/test';

const shared = { channel: 'chrome', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' } as const;

/**
 * Testes de navegador real (CSS, responsividade, persistência). Usam o Chrome instalado
 * na máquina (channel "chrome"): não baixam navegadores. Rodar: npm run test:e2e
 *
 * Dois servidores de desenvolvimento:
 *  - 5174: backend local (o padrão do app), usado por quase todos os testes.
 *  - 5175: backend Supabase, mas apontando para um endereço que NUNCA resolve (.invalid) e com chave de mentira.
 *    Serve para ver a tela de login em navegador real sem tocar no projeto Supabase de verdade. As variáveis aqui
 *    sobrescrevem qualquer .env.local da máquina.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  projects: [
    { name: 'local', testIgnore: /auth\.spec\.ts/, use: { ...shared, baseURL: 'http://localhost:5174' } },
    { name: 'remoto', testMatch: /auth\.spec\.ts/, use: { ...shared, baseURL: 'http://localhost:5175' } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_DATA_BACKEND: 'supabase',
        VITE_SUPABASE_URL: 'https://alpha7-teste.invalid',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'chave-publicavel-de-teste',
      },
    },
  ],
});
