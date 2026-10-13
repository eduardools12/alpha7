import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/App';
import { BackendRoot } from '@/app/BackendRoot';
import type { BackendConfig } from '@/data/supabase/config';
import type { FakeSupabase } from './fakeSupabase';

/** Configuração remota válida de mentira: o cliente é sempre o simulado, nunca há rede. */
export const SUPABASE_CONFIG: Extract<BackendConfig, { kind: 'supabase' }> = {
  kind: 'supabase',
  url: 'https://abcdefgh.supabase.co',
  publishableKey: 'chave-publicavel-de-teste',
};

/** O app inteiro com o backend Supabase, mas falando com a base simulada. */
export function renderRemote(fake: FakeSupabase, { path = '/' }: { path?: string } = {}) {
  const user = userEvent.setup();
  const utils = render(
    <BackendRoot config={SUPABASE_CONFIG} client={fake.client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </BackendRoot>,
  );
  return { user, ...utils };
}
