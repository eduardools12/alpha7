import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Com dezenas de arquivos de teste em paralelo a CPU fica disputada e o 1 s padrão de findBy*/waitFor
// estoura sem haver defeito (a espera só dura até o elemento aparecer, então não deixa testes lentos).
configure({ asyncUtilTimeout: 6000 });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom não implementa matchMedia nem ResizeObserver; os gráficos e o layout usam ambos.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

window.scrollTo = () => {};
