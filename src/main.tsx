import '@fontsource-variable/inter';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initInstallPrompt } from './pwa/installPrompt';
import { registerServiceWorker } from './pwa/serviceWorker';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado em index.html.');

// Escuta a instalação desde já; o service worker (abrir sem internet) só existe no build de produção.
initInstallPrompt();
if (import.meta.env.PROD) window.addEventListener('load', () => registerServiceWorker());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
