/**
 * Escolha explícita do backend de dados, lida das variáveis de ambiente do Vite:
 *
 *   VITE_DATA_BACKEND=local | supabase        (padrão: local)
 *   VITE_SUPABASE_URL=https://<ref>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   (ou a chave anon legada)
 *
 * Configuração inválida NUNCA troca de backend em silêncio nem mexe em dados locais: vira um erro explícito
 * na tela. A chave secreta (service_role / sb_secret_) é recusada: ela não pode chegar ao navegador.
 */
export type BackendConfig =
  | { kind: 'local' }
  | { kind: 'supabase'; url: string; publishableKey: string }
  | { kind: 'invalid'; problems: string[] };

export interface BackendEnv {
  VITE_DATA_BACKEND?: string | undefined;
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Lê o papel dentro de um JWT (chaves anon/service_role legadas são JWTs). null se não for um JWT legível. */
function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as unknown;
    if (typeof json === 'object' && json !== null && 'role' in json && typeof json.role === 'string') return json.role;
  } catch {
    /* não é JWT */
  }
  return null;
}

export function readBackendConfig(env: BackendEnv): BackendConfig {
  const backend = (env.VITE_DATA_BACKEND ?? '').trim().toLowerCase();
  if (backend === '' || backend === 'local') return { kind: 'local' };
  if (backend !== 'supabase') {
    return { kind: 'invalid', problems: [`VITE_DATA_BACKEND deve ser "local" ou "supabase" (valor atual: "${backend.slice(0, 30)}").`] };
  }

  const problems: string[] = [];
  const rawUrl = (env.VITE_SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

  let url = '';
  if (rawUrl === '') problems.push('Falta VITE_SUPABASE_URL (a URL do projeto, https://<ref>.supabase.co).');
  else {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname))) {
        problems.push('VITE_SUPABASE_URL deve usar https (http só vale para localhost).');
      } else url = parsed.origin;
    } catch {
      problems.push('VITE_SUPABASE_URL não é uma URL válida.');
    }
  }

  if (key === '') problems.push('Falta VITE_SUPABASE_PUBLISHABLE_KEY (a chave publishable do projeto).');
  else if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    problems.push('A chave informada é SECRETA (service_role). Ela nunca pode ser usada no navegador: use a chave publishable.');
  }

  if (problems.length > 0) return { kind: 'invalid', problems };
  return { kind: 'supabase', url, publishableKey: key };
}
