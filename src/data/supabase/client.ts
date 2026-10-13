import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BackendConfig } from './config';
import type { Database } from './database.types';

export type AlphaSupabaseClient = SupabaseClient<Database>;
type SupabaseConfig = Extract<BackendConfig, { kind: 'supabase' }>;

let cached: { id: string; client: AlphaSupabaseClient } | null = null;

/**
 * Cliente único (tipado) do Supabase. Reaproveitar a mesma instância evita sessões e assinaturas duplicadas
 * (vários clientes disputariam o mesmo armazenamento de sessão). Só recebe a chave publishable.
 *
 * Fluxo PKCE: o link do e-mail traz um código de uso único, e não o token na URL. Consequência: o link de
 * redefinição de senha precisa ser aberto no MESMO navegador em que foi pedido.
 */
export function getSupabaseClient(config: SupabaseConfig): AlphaSupabaseClient {
  const id = `${config.url}|${config.publishableKey}`;
  if (cached?.id === id) return cached.client;
  const client = createClient<Database>(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  cached = { id, client };
  return client;
}
