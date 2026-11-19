import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { MIN_PASSWORD_LENGTH, isValidEmail, useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import styles from './AuthShell.module.css';

type Mode = 'login' | 'signup' | 'forgot';
interface Errors {
  email?: string;
  password?: string;
  confirm?: string;
}

/**
 * Entrada por e-mail e senha, e criação da própria conta. Ter conta não dá acesso a nenhum dado: para entrar numa equipe
 * a pessoa usa um convite com código gerado pela comissão técnica (ou cria uma equipe nova), no passo seguinte.
 */
export function LoginPage() {
  const { signIn, signUp, requestPasswordReset, notice, pendingInvite } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [created, setCreated] = useState(false);
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
    setCreated(false);
    setPassword('');
    setConfirm('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return; // clique repetido não dispara dois envios
    const found: Errors = {};
    if (!isValidEmail(email)) found.email = 'Informe um e-mail válido.';
    if (mode === 'login' && password === '') found.password = 'Informe a senha.';
    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD_LENGTH) found.password = `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
      if (confirm !== password) found.confirm = 'As senhas não são iguais.';
    }
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;

    inFlight.current = true;
    setBusy(true);
    const result = mode === 'login' ? await signIn(email, password) : mode === 'signup' ? await signUp(email, password) : await requestPasswordReset(email);
    inFlight.current = false;
    setBusy(false);
    if (!result.ok) setFailure(result.message);
    else if (mode === 'forgot') setSent(true);
    else if (mode === 'signup' && 'confirmationRequired' in result && result.confirmationRequired) {
      setCreated(true);
      setPassword('');
      setConfirm('');
    }
    // Login válido: o AuthProvider recebe o evento de sessão e o app abre sozinho, na mesma tela de destino.
  };

  return (
    <AuthShell title={mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Redefinir senha'}>
      <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        {mode === 'login' && notice === 'expired' && (
          <Notice tone="info" title="Sua sessão expirou">
            Por segurança, entre novamente para continuar.
          </Notice>
        )}
        {pendingInvite !== null && mode !== 'forgot' && (
          <Notice tone="info" title="Você recebeu um convite">
            Entre na sua conta ou crie uma: logo depois usamos o convite para colocar você na equipe.
          </Notice>
        )}
        {mode === 'login' ? (
          <p className={styles.intro}>Entre com o e-mail e a senha da sua conta. Ainda não tem conta? Crie a sua e entre na equipe com o código de convite da comissão técnica.</p>
        ) : mode === 'signup' ? (
          <p className={styles.intro}>Crie sua conta com e-mail e senha. Ter uma conta não dá acesso aos dados de nenhuma equipe: no passo seguinte você usa o código de convite da comissão técnica ou cria a sua equipe.</p>
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
        {mode !== 'forgot' && (
          <TextField
            label="Senha"
            type="password"
            name="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={mode === 'signup' ? `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            disabled={busy}
          />
        )}
        {mode === 'signup' && (
          <TextField
            label="Confirmar senha"
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={errors.confirm}
            disabled={busy}
          />
        )}

        {failure && (
          <Notice tone="error" title={mode === 'login' ? 'Não foi possível entrar' : mode === 'signup' ? 'Não foi possível criar a conta' : 'Não foi possível enviar'}>
            {failure}
          </Notice>
        )}
        {created && (
          <Notice tone="success" title="Confirme seu e-mail">
            Enviamos um link de confirmação para o seu e-mail. Abra-o <strong>neste mesmo navegador</strong> e depois entre com a senha que você criou.
          </Notice>
        )}
        {sent && (
          <Notice tone="success" title="Verifique seu e-mail">
            Se o endereço estiver cadastrado, o link de redefinição já foi enviado. Abra-o <strong>neste mesmo navegador</strong>.
          </Notice>
        )}

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy}>
            {mode === 'login' ? (busy ? 'Entrando…' : 'Entrar') : mode === 'signup' ? (busy ? 'Criando…' : 'Criar conta') : busy ? 'Enviando…' : 'Enviar link de redefinição'}
          </Button>
          {mode === 'login' ? (
            <>
              <Button variant="ghost" onClick={() => goto('signup')} disabled={busy}>
                Criar conta
              </Button>
              <Button variant="ghost" onClick={() => goto('forgot')} disabled={busy}>
                Esqueci minha senha
              </Button>
            </>
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
