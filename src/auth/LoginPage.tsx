import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { isValidEmail, useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import styles from './AuthShell.module.css';

type Mode = 'login' | 'forgot';
interface Errors {
  email?: string;
  password?: string;
}

/**
 * Entrada por e-mail e senha. Não existe cadastro público: o acesso vem de convite da comissão técnica
 * (a conta é criada no painel do Supabase e a pessoa entra na equipe pela função add_team_member).
 */
export function LoginPage() {
  const { signIn, requestPasswordReset, notice } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false); // trava síncrona: dois envios no mesmo instante contam como um

  // Foco no primeiro campo com erro, como nos demais formulários do app.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const goto = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFailure(null);
    setSent(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return; // clique repetido não dispara dois envios
    const found: Errors = {};
    if (!isValidEmail(email)) found.email = 'Informe um e-mail válido.';
    if (mode === 'login' && password === '') found.password = 'Informe a senha.';
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;

    inFlight.current = true;
    setBusy(true);
    const result = mode === 'login' ? await signIn(email, password) : await requestPasswordReset(email);
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) setFailure(result.message);
    else if (mode === 'forgot') setSent(true);
    // Login válido: o AuthProvider recebe o evento de sessão e o app abre sozinho, na mesma tela de destino.
  };

  return (
    <AuthShell title={mode === 'login' ? 'Entrar' : 'Redefinir senha'}>
      <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        {mode === 'login' && notice === 'expired' && (
          <Notice tone="info" title="Sua sessão expirou">
            Por segurança, entre novamente para continuar.
          </Notice>
        )}
        {mode === 'login' ? (
          <p className={styles.intro}>O acesso é por convite da comissão técnica da equipe. Entre com o e-mail e a senha que você recebeu.</p>
        ) : (
          <p className={styles.intro}>Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para escolher uma nova senha.</p>
        )}

        <TextField
          label="E-mail"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={busy}
        />
        {mode === 'login' && (
          <TextField
            label="Senha"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            disabled={busy}
          />
        )}

        {failure && (
          <Notice tone="error" title={mode === 'login' ? 'Não foi possível entrar' : 'Não foi possível enviar'}>
            {failure}
          </Notice>
        )}
        {sent && (
          <Notice tone="success" title="Verifique seu e-mail">
            Se o endereço estiver cadastrado, o link de redefinição já foi enviado. Abra-o <strong>neste mesmo navegador</strong>.
          </Notice>
        )}

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy}>
            {mode === 'login' ? (busy ? 'Entrando…' : 'Entrar') : busy ? 'Enviando…' : 'Enviar link de redefinição'}
          </Button>
          {mode === 'login' ? (
            <Button variant="ghost" onClick={() => goto('forgot')} disabled={busy}>
              Esqueci minha senha
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => goto('login')} disabled={busy}>
              Voltar ao login
            </Button>
          )}
        </div>
      </form>
    </AuthShell>
  );
}
