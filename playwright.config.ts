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
  // Com os testes em paralelo a máquina fica carregada: 5 s é curto para a primeira renderização de telas com gráficos.
  expect: { timeout: 10_000 },
  reporter: 'list',
  projects: [
    { name: 'local', testIgnore: /(auth|pwa)\.spec\.ts/, use: { ...shared, baseURL: 'http://localhost:5174' } },
    { name: 'remoto', testMatch: /auth\.spec\.ts/, use: { ...shared, baseURL: 'http://localhost:5175' } },
    // Aplicativo instalável: precisa do BUILD de produção (o service worker não existe no servidor de desenvolvimento).
    { name: 'pwa', testMatch: /pwa\.spec\.ts/, use: { ...shared, baseURL: 'http://localhost:5176', serviceWorkers: 'allow' } },
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 5176 --strictPort',
      url: 'http://localhost:5176',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_DATA_BACKEND: 'local' },
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 60_000,
      // Os testes locais exigem o backend local, mesmo que o .env.local da máquina aponte para a nuvem.
      env: { VITE_DATA_BACKEND: 'local' },
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
