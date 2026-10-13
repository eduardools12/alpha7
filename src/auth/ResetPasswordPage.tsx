import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { MIN_PASSWORD_LENGTH, useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import styles from './AuthShell.module.css';

/** Mostrada quando a pessoa abre o link de redefinição: escolhe a nova senha antes de usar o app. */
export function ResetPasswordPage() {
  const { updatePassword, signOut, user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const found: typeof errors = {};
    if (password.length < MIN_PASSWORD_LENGTH) found.password = `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    if (confirm !== password) found.confirm = 'As senhas não são iguais.';
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    inFlight.current = true;
    setBusy(true);
    const result = await updatePassword(password);
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) setFailure(result.message);
    // Sucesso: o AuthProvider passa para "entrou" e o app abre.
  };

  return (
    <AuthShell title="Escolher nova senha">
      <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <p className={styles.intro}>
          {user?.email ? `Conta: ${user.email}. ` : ''}Escolha uma senha nova para continuar.
        </p>
        <TextField
          label="Nova senha"
          type="password"
          name="new-password"
          autoComplete="new-password"
          hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={busy}
        />
        <TextField
          label="Repita a nova senha"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={errors.confirm}
          disabled={busy}
        />
        {failure && (
          <Notice tone="error" title="Não foi possível salvar a senha">
            {failure}
          </Notice>
        )}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} disabled={busy}>
            Cancelar e sair
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
