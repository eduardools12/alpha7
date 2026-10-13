import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/App';
import { createDemoWorkspace, createEmptyWorkspace } from '@/data/demo';
import type { DataGateway } from '@/data/gateway';
import { LocalStorageGateway, STORAGE_KEY } from '@/data/localStorageGateway';
import { WorkspaceProvider } from '@/data/WorkspaceProvider';
import type { Workspace } from '@/data/types';

/** Armazenamento em memória: cada teste começa isolado, sem tocar no localStorage do jsdom. */
export function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

/** Data fixa para que os dados de demonstração sejam determinísticos nos testes. */
export const DEMO_NOW = new Date('2026-10-12T15:00:00');

export const demoWorkspace = () => createDemoWorkspace(DEMO_NOW);
export const emptyWorkspace = () => createEmptyWorkspace();

interface RenderOptions {
  path?: string;
  workspace?: Workspace;
  /** Reaproveita um armazenamento existente: simula recarregar a página com os mesmos dados. */
  storage?: ReturnType<typeof createMemoryStorage>;
  /** Substitui o gateway (por exemplo, para simular falhas de gravação). */
  wrapGateway?: (gateway: LocalStorageGateway) => DataGateway;
  /**
   * Por padrão, se o armazenamento ainda não tem workspace, grava `workspace` (ou a demonstração) antes de
   * abrir o app, como se a pessoa já tivesse escolhido como começar. `false` abre o navegador "sem nada":
   * mostra a tela de primeira utilização ou de recuperação, conforme os sinais de uso anterior.
   */
  seed?: boolean;
}

/** Grava um workspace como se a pessoa já o tivesse criado (inclui a marca de uso anterior). */
export function seedStorage(storage: ReturnType<typeof createMemoryStorage>, workspace: Workspace = demoWorkspace()) {
  // replaceWorkspace é síncrono por dentro (não há await): a gravação termina antes de a promessa voltar.
  void new LocalStorageGateway(storage).replaceWorkspace(structuredClone(workspace), 'teste');
}

export function renderApp({ path = '/', workspace, wrapGateway, storage: existing, seed = true }: RenderOptions = {}) {
  const storage = existing ?? createMemoryStorage();
  if (seed && storage.getItem(STORAGE_KEY) === null) seedStorage(storage, workspace);
  const local = new LocalStorageGateway(storage);
  const gateway = wrapGateway ? wrapGateway(local) : local;
  const user = userEvent.setup();
  const utils = render(
    <WorkspaceProvider gateway={gateway}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </WorkspaceProvider>,
  );
  return { user, storage, gateway, ...utils };
}
