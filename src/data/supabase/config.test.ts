import { readBackendConfig } from './config';

const URL = 'https://abcdefgh.supabase.co';
const KEY = 'sb_publishable_chave-de-teste-nao-real';
const jwt = (role: string) => `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ role, iss: 'supabase' })).replace(/=+$/, '')}.assinatura`;

describe('readBackendConfig', () => {
  it('o padrão é o armazenamento local, sem exigir nada do Supabase', () => {
    expect(readBackendConfig({})).toEqual({ kind: 'local' });
    expect(readBackendConfig({ VITE_DATA_BACKEND: '' })).toEqual({ kind: 'local' });
    expect(readBackendConfig({ VITE_DATA_BACKEND: 'local' })).toEqual({ kind: 'local' });
    expect(readBackendConfig({ VITE_DATA_BACKEND: '  LOCAL ' })).toEqual({ kind: 'local' });
    // variáveis do Supabase presentes não ativam o backend remoto sozinhas
    expect(readBackendConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toEqual({ kind: 'local' });
  });

  it('supabase com URL e chave publicável válidas', () => {
    expect(readBackendConfig({ VITE_DATA_BACKEND: 'supabase', VITE_SUPABASE_URL: `${URL}/`, VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toEqual({
      kind: 'supabase',
      url: URL,
      publishableKey: KEY,
    });
  });

  it('aceita a chave anon legada (JWT com papel anon)', () => {
    const anon = jwt('anon');
    expect(readBackendConfig({ VITE_DATA_BACKEND: 'supabase', VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: anon })).toMatchObject({ kind: 'supabase' });
  });

  it('valor desconhecido é erro explícito, não troca silenciosa de backend', () => {
    const result = readBackendConfig({ VITE_DATA_BACKEND: 'firebase' });
    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.problems[0]).toMatch(/"local" ou "supabase"/);
  });

  it('supabase sem URL ou sem chave lista o que falta', () => {
    const result = readBackendConfig({ VITE_DATA_BACKEND: 'supabase' });
    expect(result.kind === 'invalid' && result.problems).toEqual([expect.stringContaining('VITE_SUPABASE_URL'), expect.stringContaining('VITE_SUPABASE_PUBLISHABLE_KEY')]);
  });

  it('URL inválida ou insegura é recusada (http só em localhost)', () => {
    const base = { VITE_DATA_BACKEND: 'supabase', VITE_SUPABASE_PUBLISHABLE_KEY: KEY };
    expect(readBackendConfig({ ...base, VITE_SUPABASE_URL: 'não é url' }).kind).toBe('invalid');
    expect(readBackendConfig({ ...base, VITE_SUPABASE_URL: 'http://exemplo.com' }).kind).toBe('invalid');
    expect(readBackendConfig({ ...base, VITE_SUPABASE_URL: 'http://localhost:54321' })).toMatchObject({ kind: 'supabase' });
    expect(readBackendConfig({ ...base, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })).toMatchObject({ kind: 'supabase' });
  });

  it('chave SECRETA nunca é aceita no navegador', () => {
    const base = { VITE_DATA_BACKEND: 'supabase', VITE_SUPABASE_URL: URL };
    const secret = readBackendConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_valor-de-teste' });
    const serviceRole = readBackendConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') });
    for (const result of [secret, serviceRole]) {
      expect(result.kind).toBe('invalid');
      expect(result.kind === 'invalid' && result.problems.join(' ')).toMatch(/SECRETA/);
    }
  });

  it('as mensagens de erro nunca repetem o valor da chave', () => {
    const secretValue = 'sb_secret_valor-que-nao-pode-aparecer';
    const result = readBackendConfig({ VITE_DATA_BACKEND: 'supabase', VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: secretValue });
    expect(JSON.stringify(result)).not.toContain(secretValue);
  });
});
