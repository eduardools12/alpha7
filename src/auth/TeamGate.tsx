import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { mapRemoteError, type RemoteClient } from '@/data/supabase/SupabaseGateway';
import { useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import { isRole, ROLE_LABEL, type Role } from './permissions';
import styles from './AuthShell.module.css';

export interface TeamInfo {
  id: string;
  name: string;
  role: Role;
}

/** O que o resto do app precisa saber sobre a sessão: quem é, em qual equipe, e como sair ou trocar. */
export interface SessionInfo {
  email: string;
  team: TeamInfo;
  canSwitchTeam: boolean;
  switchTeam(): void;
  signOut(): Promise<void>;
  /**
   * Adiciona (ou muda o papel de) uma pessoa que JÁ TEM CONTA, pela função add_team_member do banco. Só funciona
   * para coach: a função confere o papel por dentro, e a interface só mostra o formulário a quem é coach.
   */
  addMember(email: string, role: Role): Promise<{ ok: true } | { ok: false; message: string }>;
}

const SessionInfoContext = createContext<SessionInfo | null>(null);

/** null no backend local (sem login, sem equipe). */
export const useSessionInfo = (): SessionInfo | null => useContext(SessionInfoContext);

export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 80;

type TeamClient = Pick<RemoteClient, 'from' | 'rpc'>;

/**
 * Equipes às quais a pessoa pertence, lidas das tabelas reais (team_members e teams). A RLS do banco decide o que
 * ela enxerga; linhas com papel desconhecido são ignoradas (menor privilégio: sem acesso).
 */
export async function fetchTeams(client: TeamClient, userId: string): Promise<TeamInfo[]> {
  const members = await client.from('team_members').select('team_id, role').eq('user_id', userId);
  if (members.error) throw mapRemoteError(members.error, members.status);
  const memberships = (members.data ?? []).flatMap((row) => (isRole(row.role) ? [{ teamId: row.team_id, role: row.role }] : []));
  if (memberships.length === 0) return [];

  const teams = await client.from('teams').select('id, name').in('id', memberships.map((m) => m.teamId));
  if (teams.error) throw mapRemoteError(teams.error, teams.status);
  const names = new Map((teams.data ?? []).map((team) => [team.id, team.name]));
  return memberships.flatMap((m) => {
    const name = names.get(m.teamId);
    return name === undefined ? [] : [{ id: m.teamId, name, role: m.role }];
  });
}

type Loaded = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; teams: TeamInfo[] };

interface TeamGateProps {
  client: TeamClient;
  children: (selection: { team: TeamInfo; userId: string }) => ReactNode;
}

/**
 * Depois do login: carrega as equipes da pessoa e só abre o app com UMA equipe escolhida.
 * Uma equipe: abre sozinha. Várias: tela de escolha. Nenhuma: oferece criar (função SQL create_team).
 * Trocar de pessoa ou de equipe desmonta o app, e com ele os dados em memória da equipe anterior.
 */
export function TeamGate({ client, children }: TeamGateProps) {
  const { user, signOut } = useAuth();
  const userId = user?.id ?? '';
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    setLoaded({ kind: 'loading' });
    try {
      const teams = await fetchTeams(client, userId);
      if (mine === request.current) setLoaded({ kind: 'ready', teams });
    } catch (error) {
      if (mine === request.current) {
        setLoaded({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível carregar suas equipes.' });
      }
    }
  }, [client, userId]);

  // Outra pessoa entrou: nada da anterior (equipes, escolha) fica na memória.
  useEffect(() => {
    setSelectedId(null);
    void load();
    return () => {
      request.current += 1; // respostas atrasadas de antes da troca são descartadas
    };
  }, [load]);

  const teams = loaded.kind === 'ready' ? loaded.teams : [];
  const effectiveId = selectedId ?? (teams.length === 1 ? (teams[0]?.id ?? null) : null);
  const team = teams.find((t) => t.id === effectiveId) ?? null;

  const addMember = useCallback<SessionInfo['addMember']>(
    async (email, role) => {
      if (!team) return { ok: false, message: 'Nenhuma equipe aberta.' };
      try {
        const { error, status } = await client.rpc('add_team_member', { p_team: team.id, p_email: email.trim(), p_role: role });
        if (!error) return { ok: true };
        // O banco fala português nestes casos; os demais passam pela tradução padrão.
        if (error.code === 'P0002') {
          return { ok: false, message: 'Não existe conta com este e-mail. Primeiro a conta precisa ser criada (convite no painel do Supabase).' };
        }
        if (error.code === '22023') return { ok: false, message: 'Papel inválido.' };
        if (error.code === '42501') return { ok: false, message: 'Só a comissão técnica pode adicionar pessoas à equipe.' };
        return { ok: false, message: mapRemoteError(error, status).message };
      } catch (caught) {
        return { ok: false, message: mapRemoteError({ message: caught instanceof Error ? caught.message : '' }).message };
      }
    },
    [client, team],
  );

  const session = useMemo<SessionInfo | null>(
    () =>
      team
        ? {
            email: user?.email ?? '',
            team,
            canSwitchTeam: teams.length > 1,
            switchTeam: () => setSelectedId(null),
            signOut,
            addMember,
          }
        : null,
    [team, teams.length, user?.email, signOut, addMember],
  );

  if (loaded.kind === 'loading') {
    return (
      <AuthShell title="Abrindo sua equipe">
        <LoadingBlock label="Carregando suas equipes…" />
      </AuthShell>
    );
  }
  if (loaded.kind === 'error') {
    return (
      <AuthShell title="Não foi possível abrir sua equipe">
        <div className={styles.form}>
          <Notice tone="error">{loaded.message}</Notice>
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => void load()}>
              Tentar de novo
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }
  if (teams.length === 0) return <CreateTeam client={client} onCreated={load} />;

  if (!team || !session) {
    return (
      <AuthShell title="Escolha a equipe">
        <div className={styles.form}>
          <p className={styles.intro}>Você participa de mais de uma equipe. Os dados de cada uma ficam separados.</p>
          <ul className={styles.list}>
            {teams.map((option) => (
              <li key={option.id}>
                <Button className={styles.teamButton} onClick={() => setSelectedId(option.id)}>
                  {option.name}
                  <span className={styles.role}>{ROLE_LABEL[option.role]}</span>
                </Button>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return <SessionInfoContext.Provider value={session}>{children({ team, userId })}</SessionInfoContext.Provider>;
}

/** Pessoa autenticada que ainda não pertence a nenhuma equipe: cria a primeira (vira coach, pela função do banco). */
function CreateTeam({ client, onCreated }: { client: TeamClient; onCreated: () => Promise<void> }) {
  const { signOut } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // trava síncrona: dois cliques seguidos não criam duas equipes
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmed = name.trim();
    if (trimmed.length < TEAM_NAME_MIN || trimmed.length > TEAM_NAME_MAX) {
      setError(`Use de ${TEAM_NAME_MIN} a ${TEAM_NAME_MAX} caracteres.`);
      return;
    }
    setError(undefined);
    setFailure(null);
    inFlight.current = true;
    setBusy(true);
    try {
      const { error: rpcError, status } = await client.rpc('create_team', { p_name: trimmed });
      if (rpcError) {
        setFailure(rpcError.code === '23514' ? 'O nome da equipe não é válido.' : mapRemoteError(rpcError, status).message);
        return;
      }
      await onCreated(); // recarrega: a equipe nova aparece e abre sozinha
    } catch (caught) {
      setFailure(mapRemoteError({ message: caught instanceof Error ? caught.message : '' }).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Criar sua equipe">
      <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <p className={styles.intro}>
          Sua conta ainda não participa de nenhuma equipe. Se você foi convidado, peça à comissão técnica para adicionar o seu e-mail à
          equipe. Se esta é a primeira vez, crie a equipe: você será a comissão técnica dela.
        </p>
        <TextField label="Nome da equipe" name="team-name" value={name} onChange={(event) => setName(event.target.value)} error={error} disabled={busy} />
        {failure && (
          <Notice tone="error" title="Não foi possível criar a equipe">
            {failure}
          </Notice>
        )}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Criando…' : 'Criar equipe'}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} disabled={busy}>
            Sair
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
