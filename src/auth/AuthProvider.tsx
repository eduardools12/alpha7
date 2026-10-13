import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AlphaSupabaseClient } from '@/data/supabase/client';

/** O que o provedor usa do cliente: só autenticação. Os dados da equipe são assunto do SupabaseGateway. */
export type AuthClient = Pick<AlphaSupabaseClient, 'auth'>;

/**
 * loading     lendo a sessão guardada no navegador.
 * signed-out  sem sessão: mostra o login.
 * signed-in   sessão válida.
 * recovery    a pessoa abriu o link de redefinição de senha: precisa escolher a nova senha antes de usar o app.
 */
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'recovery';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthResult = { ok: true } | { ok: false; message: string };

export interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Por que voltou ao login sem a pessoa pedir: a sessão expirou ou foi encerrada em outro lugar. */
  notice: 'expired' | null;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Pede o e-mail de redefinição. Sempre responde igual, exista a conta ou não (não revela quem tem acesso). */
  requestPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
}

export const MIN_PASSWORD_LENGTH = 8;

const AuthContext = createContext<AuthValue | null>(null);

interface AuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

/** Mensagem em português para um erro de autenticação. Nunca diz se o e-mail existe. */
export function describeAuthError(error: AuthErrorLike, fallback: string): string {
  const message = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';
  if (error.status === 0 || error.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed|fetch failed/.test(message)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  if (error.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || /rate limit|too many/.test(message)) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
  }
  if (code === 'invalid_credentials' || /invalid login credentials/.test(message)) return 'E-mail ou senha incorretos.';
  if (code === 'email_not_confirmed' || /email not confirmed/.test(message)) return 'Este e-mail ainda não foi confirmado. Use o convite recebido.';
  if (code === 'weak_password' || /password should be|weak password/.test(message)) {
    return `A senha não atende aos requisitos de segurança (use pelo menos ${MIN_PASSWORD_LENGTH} caracteres).`;
  }
  if (code === 'same_password' || /different from the old password/.test(message)) return 'Escolha uma senha diferente da anterior.';
  if (code === 'session_not_found' || code === 'session_expired' || /session.*(expired|missing|not found)|jwt expired/.test(message)) {
    return 'A sessão expirou. Peça um novo link de redefinição e tente de novo.';
  }
  return fallback;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (value: string) => EMAIL.test(value.trim());

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState<'expired' | null>(null);
  // O estado mais recente, para decidir dentro do evento se um "SIGNED_OUT" foi pedido pela pessoa.
  const statusRef = useRef<AuthStatus>('loading');
  const signingOut = useRef(false);
  statusRef.current = status;

  useEffect(() => {
    let active = true;
    const apply = (next: AuthStatus, nextUser: AuthUser | null) => {
      statusRef.current = next;
      setStatus(next);
      setUser(nextUser);
    };
    const toUser = (session: { user: { id: string; email?: string | undefined } }): AuthUser => ({
      id: session.user.id,
      email: session.user.email ?? '',
    });

    // Atenção: dentro deste callback não se chama outra função do cliente (risco de travar a fila de eventos).
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setNotice(null);
        apply('recovery', toUser(session));
      } else if (session) {
        // Durante a redefinição de senha, eventos como TOKEN_REFRESHED não tiram a pessoa dessa tela.
        if (statusRef.current === 'recovery') setUser(toUser(session));
        else {
          setNotice(null);
          apply('signed-in', toUser(session));
        }
      } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        // Sem sessão. Se ela existia e a pessoa não pediu para sair, expirou (ou foi encerrada em outro lugar).
        if (statusRef.current === 'signed-in' && !signingOut.current) setNotice('expired');
        apply('signed-out', null);
      }
    });

    void client.auth.getSession().then(({ data: current, error }) => {
      if (!active) return;
      if (statusRef.current !== 'loading') return; // um evento já definiu o estado
      if (error || !current.session) apply('signed-out', null);
      else apply('signed-in', toUser(current.session));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback<AuthValue['signIn']>(
    async (email, password) => {
      try {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return { ok: false, message: describeAuthError(error, 'Não foi possível entrar. Tente de novo.') };
        return { ok: true };
      } catch (error) {
        return { ok: false, message: describeAuthError(error instanceof Error ? error : {}, 'Não foi possível entrar. Tente de novo.') };
      }
    },
    [client],
  );

  const signOut = useCallback<AuthValue['signOut']>(async () => {
    signingOut.current = true;
    try {
      await client.auth.signOut();
    } finally {
      signingOut.current = false;
      setNotice(null);
      statusRef.current = 'signed-out';
      setStatus('signed-out');
      setUser(null); // nada da pessoa anterior fica na memória
    }
  }, [client]);

  const requestPasswordReset = useCallback<AuthValue['requestPasswordReset']>(
    async (email) => {
      try {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
        // Limite de envios e falha de rede a pessoa precisa saber; o resto responde sempre igual (sem revelar contas).
        if (error && (error.status === 429 || error.status === 0 || /rate limit|fetch|network/i.test(error.message))) {
          return { ok: false, message: describeAuthError(error, 'Não foi possível enviar o e-mail agora. Tente de novo.') };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, message: describeAuthError(error instanceof Error ? error : {}, 'Não foi possível enviar o e-mail agora. Tente de novo.') };
      }
    },
    [client],
  );

  const updatePassword = useCallback<AuthValue['updatePassword']>(
    async (password) => {
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) return { ok: false, message: describeAuthError(error, 'Não foi possível salvar a nova senha. Tente de novo.') };
        statusRef.current = 'signed-in';
        setStatus('signed-in');
        return { ok: true };
      } catch (error) {
        return { ok: false, message: describeAuthError(error instanceof Error ? error : {}, 'Não foi possível salvar a nova senha. Tente de novo.') };
      }
    },
    [client],
  );

  const value = useMemo<AuthValue>(
    () => ({ status, user, notice, signIn, signOut, requestPasswordReset, updatePassword }),
    [status, user, notice, signIn, signOut, requestPasswordReset, updatePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return value;
}

/** Como useAuth, mas devolve null no backend local (onde não há login). */
export const useOptionalAuth = (): AuthValue | null => useContext(AuthContext);
