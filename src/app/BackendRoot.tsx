import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessProvider } from '@/auth/AccessContext';
import type { Role } from '@/auth/permissions';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { AuthShell } from '@/auth/AuthShell';
import { LoginPage } from '@/auth/LoginPage';
import { ResetPasswordPage } from '@/auth/ResetPasswordPage';
import { TeamGate } from '@/auth/TeamGate';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import type { DataGateway } from '@/data/gateway';
import type { AlphaSupabaseClient } from '@/data/supabase/client';
import { readBackendConfig, type BackendConfig } from '@/data/supabase/config';
import { SupabaseGateway } from '@/data/supabase/SupabaseGateway';
import { WorkspaceProvider } from '@/data/WorkspaceProvider';
import authStyles from '@/auth/AuthShell.module.css';

interface BackendRootProps {
  children: ReactNode;
  /** Só para testes: configuração e cliente injetados. No app, vêm do ambiente do Vite. */
  config?: BackendConfig;
  client?: AlphaSupabaseClient;
}

/**
 * Escolhe o backend de dados de forma EXPLÍCITA (VITE_DATA_BACKEND):
 *  - local (padrão): como sempre, sem login. Os dados locais não são tocados pelo backend remoto.
 *  - supabase: exige login e equipe; os dados vêm do banco.
 *  - inválido: erro na tela. Nunca troca de backend em silêncio.
 * Os dados locais e os remotos nunca se misturam: cada backend tem o seu gateway, e trocar de pessoa ou de
 * equipe recria o provedor (e limpa a memória).
 */
export function BackendRoot({ children, config = readBackendConfig(import.meta.env), client }: BackendRootProps) {
  if (config.kind === 'invalid') return <ConfigError problems={config.problems} />;
  if (config.kind === 'local') return <WorkspaceProvider>{children}</WorkspaceProvider>;
  return <RemoteRoot config={config} {...(client ? { client } : {})}>{children}</RemoteRoot>;
}

function RemoteRoot({ config, client, children }: { config: Extract<BackendConfig, { kind: 'supabase' }>; client?: AlphaSupabaseClient; children: ReactNode }) {
  // A biblioteca do Supabase só é baixada quando este backend está ligado: quem usa o modo local não paga por ela.
  const [resolved, setResolved] = useState<AlphaSupabaseClient | null>(client ?? null);
  const [loadFailure, setLoadFailure] = useState(false);
  useEffect(() => {
    if (client) {
      setResolved(client);
      return;
    }
    let active = true;
    import('@/data/supabase/client').then(
      (module) => active && setResolved(module.getSupabaseClient(config)),
      () => active && setLoadFailure(true),
    );
    return () => {
      active = false;
    };
  }, [client, config]);

  if (loadFailure) {
    return (
      <AuthShell title="Não foi possível carregar o acesso">
        <Notice tone="error">Não foi possível carregar o módulo de acesso à nuvem. Verifique a internet e recarregue a página. Nada foi alterado.</Notice>
      </AuthShell>
    );
  }
  if (!resolved) {
    return (
      <AuthShell title="Entrando">
        <LoadingBlock label="Preparando o acesso…" />
      </AuthShell>
    );
  }
  return (
    <AuthProvider client={resolved}>
      <AuthGate>
        <TeamGate client={resolved}>
          {({ team, userId }) => (
            // key: outra pessoa ou outra equipe = provedor novo = nenhum dado da anterior na memória
            <RemoteWorkspace key={`${userId}:${team.id}`} client={resolved} teamId={team.id} userId={userId} role={team.role}>
              {children}
            </RemoteWorkspace>
          )}
        </TeamGate>
      </AuthGate>
    </AuthProvider>
  );
}

function RemoteWorkspace({ client, teamId, userId, role, children }: { client: AlphaSupabaseClient; teamId: string; userId: string; role: Role; children: ReactNode }) {
  const gateway = useMemo<DataGateway>(() => new SupabaseGateway({ client, teamId, userId }), [client, teamId, userId]);
  return (
    <AccessProvider role={role}>
      <WorkspaceProvider gateway={gateway}>{children}</WorkspaceProvider>
    </AccessProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <AuthShell title="Entrando">
        <LoadingBlock label="Verificando sua sessão…" />
      </AuthShell>
    );
  }
  if (status === 'recovery') return <ResetPasswordPage />;
  if (status === 'signed-out') return <LoginPage />;
  return <>{children}</>;
}

/** Configuração incompleta ou inválida: explica o que ajustar. Não mostra valores de credenciais. */
function ConfigError({ problems }: { problems: string[] }) {
  return (
    <AuthShell title="Configuração do Alpha7">
      <div className={authStyles.form}>
        <Notice tone="error" title="O backend de dados não está configurado corretamente">
          <ul className={authStyles.problems}>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Notice>
        <p className={authStyles.intro}>
          Nada foi alterado e o aplicativo não trocou de backend sozinho. Ajuste o arquivo <code>.env.local</code> (modelo em{' '}
          <code>.env.example</code>) e reinicie o servidor. Para usar os dados deste navegador, deixe <code>VITE_DATA_BACKEND</code> vazio
          ou como <code>local</code>.
        </p>
      </div>
    </AuthShell>
  );
}
