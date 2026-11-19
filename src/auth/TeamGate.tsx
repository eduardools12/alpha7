import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { mapRemoteError, type RemoteClient } from '@/data/supabase/SupabaseGateway';
import { useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import { formatInviteCode, isInviteCodeComplete } from './inviteCode';
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
  /** Convites (só coach): criar (o código só aparece agora), listar e revogar. O banco confere o papel. */
  createInvite(input: InviteInput): Promise<{ ok: true; invite: CreatedInvite } | { ok: false; message: string }>;
  listInvites(): Promise<{ ok: true; invites: InviteRow[] } | { ok: false; message: string }>;
  revokeInvite(id: string): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Entra em OUTRA equipe com um código de convite e a abre (qualquer papel). */
  redeemInvite(code: string): Promise<RedeemResult>;
}

export interface InviteInput {
  role: Role;
  label: string;
  validDays: number;
  maxUses: number;
}
export interface CreatedInvite {
  id: string;
  code: string;
  expiresAt: string;
}
export interface InviteRow {
  id: string;
  role: Role;
  label: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}
export type RedeemResult = { ok: true; teamId: string; role: Role; already: boolean } | { ok: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Resgata o convite pela função do banco. Convite inválido volta como resposta (não como erro) e sempre com o mesmo texto. */
async function redeemWith(client: TeamClient, code: string): Promise<RedeemResult> {
  try {
    const { data, error, status } = await client.rpc('redeem_team_invite', { p_code: code });
    if (error) return { ok: false, message: mapRemoteError(error, status).message };
    if (!isRecord(data)) return { ok: false, message: 'Resposta inesperada do servidor. Tente de novo.' };
    if (data.ok === true && typeof data.team_id === 'string' && isRole(data.role)) {
      return { ok: true, teamId: data.team_id, role: data.role, already: data.already === true };
    }
    if (data.reason === 'throttled') return { ok: false, message: 'Muitas tentativas com código inválido. Aguarde 15 minutos e tente de novo.' };
    return { ok: false, message: 'Convite inválido, expirado ou já usado. Confira o código ou peça um novo à comissão técnica.' };
  } catch (caught) {
    return { ok: false, message: mapRemoteError({ message: caught instanceof Error ? caught.message : '' }).message };
  }
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
  const { user, signOut, pendingInvite, dismissPendingInvite } = useAuth();
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
          return { ok: false, message: 'Não existe conta com este e-mail. A pessoa precisa criar a conta no app primeiro (ou use um convite com código).' };
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

  const createInvite = useCallback<SessionInfo['createInvite']>(
    async (input) => {
      if (!team) return { ok: false, message: 'Nenhuma equipe aberta.' };
      try {
        const { data, error, status } = await client.rpc('create_team_invite', {
          p_team: team.id,
          p_role: input.role,
          p_label: input.label.trim(),
          p_valid_days: input.validDays,
          p_max_uses: input.maxUses,
        });
        if (error) {
          if (error.code === '42501') return { ok: false, message: 'Só a comissão técnica pode criar convites.' };
          if (error.code === '22023') return { ok: false, message: error.message };
          return { ok: false, message: mapRemoteError(error, status).message };
        }
        if (isRecord(data) && typeof data.id === 'string' && typeof data.code === 'string' && typeof data.expires_at === 'string') {
          return { ok: true, invite: { id: data.id, code: data.code, expiresAt: data.expires_at } };
        }
        return { ok: false, message: 'Resposta inesperada do servidor. Tente de novo.' };
      } catch (caught) {
        return { ok: false, message: mapRemoteError({ message: caught instanceof Error ? caught.message : '' }).message };
      }
    },
    [client, team],
  );

  const listInvites = useCallback<SessionInfo['listInvites']>(async () => {
    if (!team) return { ok: false, message: 'Nenhuma equipe aberta.' };
    try {
      const { data, error, status } = await client
        .from('team_invites')
        .select('id, role, label, max_uses, used_count, expires_at, revoked_at, created_at')
        .eq('team_id', team.id)
        .order('created_at', { ascending: false });
      if (error) return { ok: false, message: mapRemoteError(error, status).message };
      const invites = (data ?? []).flatMap((row) =>
        isRole(row.role)
          ? [{ id: row.id, role: row.role, label: row.label, maxUses: row.max_uses, usedCount: row.used_count, expiresAt: row.expires_at, revokedAt: row.revoked_at, createdAt: row.created_at }]
          : [],
      );
      return { ok: true, invites };
    } catch (caught) {
      return { ok: false, message: mapRemoteError({ message: caught instanceof Error ? caught.message : '' }).message };
    }
  }, [client, team]);

  const revokeInvite = useCallback<SessionInfo['revokeInvite']>(
    async (id) => {
      if (!team) return { ok: false, message: 'Nenhuma equipe aberta.' };
      try {
        const { error, status } = await client.rpc('revoke_team_invite', { p_team: team.id, p_invite: id });
        if (!error) return { ok: true };
        if (error.code === '42501') return { ok: false, message: 'Só a comissão técnica pode revogar convites.' };
        return { ok: false, message: mapRemoteError(error, status).message };
      } catch (caught) {
        return { ok: false, message: mapRemoteError({ message: caught instanceof Error ? caught.message : '' }).message };
      }
    },
    [client, team],
  );

  /** Resgata o convite; se deu certo, recarrega as equipes e abre a nova (o app da equipe anterior é desmontado). */
  const joinWithCode = useCallback(
    async (code: string): Promise<RedeemResult> => {
      const result = await redeemWith(client, code);
      if (result.ok) {
        dismissPendingInvite();
        await load();
        setSelectedId(result.teamId);
      }
      return result;
    },
    [client, load, dismissPendingInvite],
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
            createInvite,
            listInvites,
            revokeInvite,
            redeemInvite: joinWithCode,
          }
        : null,
    [team, teams.length, user?.email, signOut, addMember, createInvite, listInvites, revokeInvite, joinWithCode],
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
  if (pendingInvite !== null) {
    return <InviteScreen initialCode={pendingInvite} hasTeams={teams.length > 0} onJoin={joinWithCode} onDismiss={dismissPendingInvite} />;
  }
  if (teams.length === 0) return <CreateTeam client={client} onCreated={load} onJoin={joinWithCode} />;

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

/** Campo do código de convite com o botão que o usa. Compartilhado pelas telas de convite pendente e de "sem equipe". */
export function CodeForm({ initialCode, onJoin, label }: { initialCode: string; onJoin: (code: string) => Promise<RedeemResult>; label: string }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // trava síncrona: dois cliques seguidos gastam um uso só
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!isInviteCodeComplete(code)) {
      setError('O código tem 12 letras e números, como A1B2-C3D4-E5F6.');
      return;
    }
    setError(undefined);
    setFailure(null);
    inFlight.current = true;
    setBusy(true);
    const result = await onJoin(code);
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) setFailure(result.message);
  };

  return (
    <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate aria-label={label}>
      <TextField
        label="Código do convite"
        name="invite-code"
        autoComplete="off"
        autoCapitalize="characters"
        value={code}
        onChange={(event) => setCode(formatInviteCode(event.target.value))}
        error={error}
        disabled={busy}
      />
      {failure && (
        <Notice tone="error" title="Não foi possível usar o convite">
          {failure}
        </Notice>
      )}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar na equipe'}
        </Button>
      </div>
    </form>
  );
}

/** Convite recebido por link: confirmar o uso (ou dispensar) antes de seguir para a equipe. */
function InviteScreen({
  initialCode,
  hasTeams,
  onJoin,
  onDismiss,
}: {
  initialCode: string;
  hasTeams: boolean;
  onJoin: (code: string) => Promise<RedeemResult>;
  onDismiss: () => void;
}) {
  const { signOut } = useAuth();
  return (
    <AuthShell title="Você recebeu um convite">
      <div className={styles.form}>
        <p className={styles.intro}>
          {hasTeams
            ? 'Use o convite para entrar em outra equipe. Você continua com acesso às equipes em que já está.'
            : 'Use o convite para entrar na equipe. O papel que você terá foi escolhido pela comissão técnica.'}
        </p>
        <CodeForm initialCode={initialCode} onJoin={onJoin} label="Usar convite" />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onDismiss}>
            Agora não
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}

/**
 * Pessoa autenticada que ainda não pertence a nenhuma equipe: entra com um código de convite da comissão técnica ou cria a
 * primeira equipe (vira coach, pela função do banco).
 */
function CreateTeam({ client, onCreated, onJoin }: { client: TeamClient; onCreated: () => Promise<void>; onJoin: (code: string) => Promise<RedeemResult> }) {
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
    <AuthShell title="Entrar numa equipe">
      <div className={styles.form}>
        <p className={styles.intro}>
          Sua conta ainda não participa de nenhuma equipe. Se você recebeu um código de convite da comissão técnica, use-o aqui.
        </p>
        <CodeForm initialCode="" onJoin={onJoin} label="Entrar com convite" />
      </div>
      <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate aria-label="Criar equipe">
        <p className={styles.intro}>Sem convite? Crie uma equipe nova: você será a comissão técnica dela e poderá convidar outras pessoas.</p>
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
