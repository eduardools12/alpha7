/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { serviceWorkerPlugin } from './scripts/serviceWorkerPlugin.ts';

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Com um trabalhador por núcleo (ou mais), a disputa de CPU fazia testes de tela isolados estourarem o tempo só na
    // suíte inteira. Metade dos núcleos passou estável e ainda terminou mais rápido (71 s contra 82 s).
    maxWorkers: '50%',
    // Testes de tela simulam dezenas de cliques; com a suíte em paralelo o padrão de 5 s é curto.
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
