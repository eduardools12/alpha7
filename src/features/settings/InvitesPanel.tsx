import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { inviteLink } from '@/auth/inviteCode';
import { INVITE_STATUS_LABEL, inviteStatus } from '@/auth/inviteStatus';
import { ROLES, ROLE_LABEL, isRole, type Role } from '@/auth/permissions';
import type { CreatedInvite, InviteRow, SessionInfo } from '@/auth/TeamGate';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import styles from './DataPanel.module.css';
import invites from './InvitesPanel.module.css';

const VALIDITY_DAYS = [1, 7, 30, 90] as const;
const MAX_USES = [1, 5, 20, 50] as const;
const LABEL_MAX = 60;

const dayLabel = (days: number) => (days === 1 ? '1 dia' : `${days} dias`);
const usesLabel = (uses: number) => (uses === 1 ? '1 pessoa (uso único)' : `${uses} pessoas`);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

type Session = Pick<SessionInfo, 'createInvite' | 'listInvites' | 'revokeInvite'>;

/**
 * Convites com código (só coach). O código aparece UMA vez, na criação: o banco guarda apenas o hash. Quem receber o
 * código (ou o link) cria a própria conta no app e entra na equipe com o papel escolhido aqui.
 */
export function InvitesPanel({ session }: { session: Session }) {
  const [role, setRole] = useState<Role>('viewer');
  const [validDays, setValidDays] = useState<number>(7);
  const [maxUses, setMaxUses] = useState<number>(1);
  const [label, setLabel] = useState('');
  const [labelError, setLabelError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [list, setList] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; invites: InviteRow[] }>({ kind: 'loading' });
  const [revokeFailure, setRevokeFailure] = useState<string | null>(null);
  const inFlight = useRef(false); // trava síncrona: dois cliques não criam dois convites

  const load = useCallback(async () => {
    const result = await session.listInvites();
    setList(result.ok ? { kind: 'ready', invites: result.invites } : { kind: 'error', message: result.message });
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (label.trim().length > LABEL_MAX) {
      setLabelError(`Use até ${LABEL_MAX} caracteres.`);
      return;
    }
    setLabelError(undefined);
    setFailure(null);
    setCopied(null);
    inFlight.current = true;
    setBusy(true);
    const result = await session.createInvite({ role, label, validDays, maxUses });
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    setCreated(result.invite);
    setLabel('');
    void load();
  };

  const copy = async (what: 'code' | 'link', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what === 'code' ? 'Código copiado.' : 'Link copiado.');
    } catch {
      setCopied('Não foi possível copiar sozinho: selecione o texto e copie.');
    }
  };

  const revoke = async (invite: InviteRow) => {
    setRevokeFailure(null);
    const result = await session.revokeInvite(invite.id);
    if (!result.ok) setRevokeFailure(result.message);
    await load();
  };

  const link = created ? inviteLink(window.location.origin, created.code) : '';

  return (
    <div className={styles.block}>
      <form className={invites.form} onSubmit={(event) => void submit(event)} noValidate aria-label="Criar convite">
        <h3 className={styles.heading}>Convidar pessoas</h3>
        <p className={styles.muted}>
          Crie um convite e envie o código (ou o link) à pessoa. Ela cria a própria conta no app e entra na equipe com o papel que você escolher aqui.
        </p>
        <div className={invites.fields}>
          <SelectField label="Papel" value={role} onChange={(e) => isRole(e.target.value) && setRole(e.target.value)} disabled={busy}>
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABEL[option]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Validade" value={String(validDays)} onChange={(e) => setValidDays(Number(e.target.value))} disabled={busy}>
            {VALIDITY_DAYS.map((days) => (
              <option key={days} value={days}>
                {dayLabel(days)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Quantas pessoas podem usar" value={String(maxUses)} onChange={(e) => setMaxUses(Number(e.target.value))} disabled={busy}>
            {MAX_USES.map((uses) => (
              <option key={uses} value={uses}>
                {usesLabel(uses)}
              </option>
            ))}
          </SelectField>
          <TextField label="Rótulo (opcional)" name="invite-label" value={label} onChange={(e) => setLabel(e.target.value)} error={labelError} hint="Só para você reconhecer o convite na lista." disabled={busy} />
        </div>
        {role === 'coach' && (
          <Notice tone="warning" title="Convite de comissão técnica">
            Quem usar este convite terá acesso total à equipe, inclusive para convidar e remover pessoas. Prefira “Analista” ou “Somente leitura”.
          </Notice>
        )}
        {failure && (
          <Notice tone="error" title="Não foi possível criar o convite">
            {failure}
          </Notice>
        )}
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Criando…' : 'Criar convite'}
          </Button>
        </div>
      </form>

      {created && (
        <Notice tone="success" title="Convite criado">
          <p>
            Código: <strong className={invites.code}>{created.code}</strong>
          </p>
          <p className={invites.link}>{link}</p>
          <p>{`Vale até ${formatDate(created.expiresAt)}. Guarde agora: por segurança o código não será mostrado de novo.`}</p>
          <div className={invites.actions}>
            <Button onClick={() => void copy('code', created.code)}>Copiar código</Button>
            <Button onClick={() => void copy('link', link)}>Copiar link</Button>
          </div>
          {copied && <p role="status">{copied}</p>}
        </Notice>
      )}

      <section aria-label="Convites criados">
        <h3 className={styles.heading}>Convites criados</h3>
        {revokeFailure && <Notice tone="error">{revokeFailure}</Notice>}
        {list.kind === 'loading' && <p className={styles.muted}>Carregando convites…</p>}
        {list.kind === 'error' && (
          <Notice tone="error" title="Não foi possível carregar os convites" action={<Button onClick={() => void load()}>Tentar de novo</Button>}>
            {list.message}
          </Notice>
        )}
        {list.kind === 'ready' && list.invites.length === 0 && <p className={styles.muted}>Nenhum convite criado ainda.</p>}
        {list.kind === 'ready' && list.invites.length > 0 && (
          <ul className={invites.list}>
            {list.invites.map((invite) => {
              const status = inviteStatus(invite, new Date());
              const name = invite.label ?? 'Sem rótulo';
              return (
                <li key={invite.id} className={invites.item}>
                  <div>
                    <strong>{name}</strong>
                    <p className={styles.muted}>
                      {`${ROLE_LABEL[invite.role]} · ${invite.usedCount} de ${invite.maxUses} ${invite.maxUses === 1 ? 'uso' : 'usos'} · ${
                        status === 'active' ? `vale até ${formatDate(invite.expiresAt)}` : INVITE_STATUS_LABEL[status]
                      }`}
                    </p>
                  </div>
                  {status === 'active' && (
                    <Button variant="ghost" aria-label={`Revogar convite ${name}`} onClick={() => void revoke(invite)}>
                      Revogar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
