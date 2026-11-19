import { useRef, useState, type FormEvent } from 'react';
import { useAccess } from '@/auth/AccessContext';
import { isValidEmail } from '@/auth/AuthProvider';
import { CodeForm, useSessionInfo } from '@/auth/TeamGate';
import { CAPABILITIES, CAPABILITY_LABEL, ROLES, ROLE_LABEL, isRole, type Role } from '@/auth/permissions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { InvitesPanel } from './InvitesPanel';
import styles from './DataPanel.module.css';

/** Conta, equipe e papel. Só existe com os dados na nuvem (no backend local não há login). */
export function AccountPanel() {
  const session = useSessionInfo();
  const access = useAccess();
  if (!session) return null;
  const allowed = CAPABILITIES.filter((capability) => access.can(capability));
  const denied = CAPABILITIES.filter((capability) => !access.can(capability));

  return (
    <Card title="Conta e equipe" id="conta">
      <dl className={styles.facts}>
        <div>
          <dt>Conectado como</dt>
          <dd>{session.email}</dd>
        </div>
        <div>
          <dt>Equipe</dt>
          <dd>{session.team.name}</dd>
        </div>
        <div>
          <dt>Seu papel</dt>
          <dd>{ROLE_LABEL[session.team.role]}</dd>
        </div>
      </dl>
      <p className={styles.muted}>
        O que você pode fazer: {allowed.length > 0 ? allowed.map((c) => CAPABILITY_LABEL[c]).join('; ') : 'apenas consultar os dados'}.
        {denied.length > 0 && ` Não permitido para o seu papel: ${denied.map((c) => CAPABILITY_LABEL[c]).join('; ')}.`} Estas regras são aplicadas
        pelo banco de dados; a interface só esconde o que seria recusado.
      </p>
      <div className={styles.row}>
        {session.canSwitchTeam && <Button onClick={session.switchTeam}>Trocar de equipe</Button>}
        <Button variant="danger" onClick={() => void session.signOut()}>
          Sair
        </Button>
      </div>
      {session.team.role === 'coach' && <InvitesPanel session={session} />}
      {session.team.role === 'coach' && <AddMember addMember={session.addMember} />}
      <div className={styles.block}>
        <h3 className={styles.heading}>Entrar em outra equipe</h3>
        <p className={styles.muted}>Recebeu um código de convite de outra equipe? Use-o aqui. Você continua nesta equipe e pode trocar de uma para a outra.</p>
        <CodeForm initialCode="" onJoin={session.redeemInvite} label="Entrar em outra equipe com convite" />
      </div>
    </Card>
  );
}

/**
 * Adicionar uma pessoa à equipe (só coach), pela função add_team_member do banco. Não cria contas: a pessoa precisa
 * já ter criado a conta no app (quem ainda não tem entra pelo convite com código).
 */
function AddMember({ addMember }: { addMember: (email: string, role: Role) => Promise<{ ok: true } | { ok: false; message: string }> }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // trava síncrona: dois envios no mesmo instante chamam o banco uma vez só

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setResult(null);
    if (!isValidEmail(email)) {
      setError('Informe um e-mail válido.');
      return;
    }
    setError(undefined);
    inFlight.current = true;
    setBusy(true);
    const outcome = await addMember(email, role);
    inFlight.current = false;
    setBusy(false);
    if (outcome.ok) {
      setResult({ tone: 'success', text: `${email.trim()} agora participa da equipe com o papel "${ROLE_LABEL[role]}".` });
      setEmail('');
    } else setResult({ tone: 'error', text: outcome.message });
  };

  return (
    <form className={styles.block} onSubmit={(event) => void submit(event)} noValidate aria-label="Adicionar pessoa à equipe">
      <h3 className={styles.heading}>Adicionar pessoa à equipe</h3>
      <p className={styles.muted}>
        Para quem já tem conta no app (criada pela própria pessoa). Aqui você define a equipe e o papel dela; se ela já está na equipe, o papel é
        atualizado. Para quem ainda não tem conta, prefira o convite com código acima.
      </p>
      <TextField label="E-mail da pessoa" type="email" name="member-email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} disabled={busy} />
      <SelectField label="Papel" value={role} onChange={(e) => isRole(e.target.value) && setRole(e.target.value)} disabled={busy}>
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABEL[option]}
          </option>
        ))}
      </SelectField>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Adicionando…' : 'Adicionar à equipe'}
        </Button>
      </div>
    </form>
  );
}
