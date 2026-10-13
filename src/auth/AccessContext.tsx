import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from '@/components/ui/Notice';
import { CAPABILITY_LABEL, ROLE_LABEL, roleCan, type Capability, type Role } from './permissions';

export interface Access {
  /** null = armazenamento local: não há papéis, a pessoa dona do navegador pode tudo. */
  role: Role | null;
  can(capability: Capability): boolean;
  /** Papel sem nenhuma permissão de escrita. */
  readOnly: boolean;
}

const FULL_ACCESS: Access = { role: null, can: () => true, readOnly: false };

const AccessContext = createContext<Access>(FULL_ACCESS);

/** Define o papel da pessoa na equipe aberta. Sem este provedor (backend local), tudo é permitido. */
export function AccessProvider({ role, children }: { role: Role; children: ReactNode }) {
  const value = useMemo<Access>(
    () => ({
      role,
      can: (capability) => roleCan(role, capability),
      readOnly: role === 'viewer',
    }),
    [role],
  );
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export const useAccess = (): Access => useContext(AccessContext);
export const useCan = (capability: Capability): boolean => useContext(AccessContext).can(capability);

/** Mostra o conteúdo só para quem tem a permissão (o banco recusa as demais escritas de qualquer forma). */
export function Can({ to, children }: { to: Capability; children: ReactNode }) {
  return useCan(to) ? <>{children}</> : null;
}

/** Protege uma tela de escrita aberta por endereço: sem permissão, explica em vez de mostrar o formulário. */
export function RequireCapability({ capability, children }: { capability: Capability; children: ReactNode }) {
  const access = useAccess();
  if (access.can(capability)) return <>{children}</>;
  return (
    <Notice tone="warning" title="Seu papel não permite esta ação">
      Com o papel “{access.role ? ROLE_LABEL[access.role] : ''}” você não pode {CAPABILITY_LABEL[capability]}. Peça à comissão
      técnica da equipe se precisar de outro acesso. <Link to="/">Voltar ao início</Link>
    </Notice>
  );
}
