import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/App';
import { createDemoWorkspace, createEmptyWorkspace } from '@/data/demo';
import type { DataGateway } from '@/data/gateway';
import { LocalStorageGateway } from '@/data/localStorageGateway';
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
}

export function renderApp({ path = '/', workspace, wrapGateway, storage: existing }: RenderOptions = {}) {
  const storage = existing ?? createMemoryStorage();
  const local = new LocalStorageGateway(storage, () => structuredClone(workspace ?? demoWorkspace()));
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
