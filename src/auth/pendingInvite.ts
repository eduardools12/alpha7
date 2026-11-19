import { inviteCodeFromSearch } from './inviteCode';

/**
 * Convite recebido por link (`?convite=CÓDIGO`). O código é guardado neste navegador até ser usado (ou recusado) e sai do
 * endereço na hora, para não ficar no histórico, em capturas de tela nem ser repassado a outros sites. Vive em
 * localStorage (não em sessionStorage) porque o link de confirmação de e-mail abre outra aba.
 */
const KEY = 'alpha7.pendingInvite';

export function readPendingInvite(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // armazenamento bloqueado: a pessoa digita o código
  }
}

export function savePendingInvite(code: string): void {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // sem armazenamento: o código fica só na tela desta visita
  }
}

export function clearPendingInvite(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}

/** Lê `?convite=` do endereço atual, guarda o código e tira o parâmetro da barra de endereço. Devolve o código pendente, se houver. */
export function capturePendingInvite(): string | null {
  const fromLink = inviteCodeFromSearch(window.location.search);
  if (fromLink !== null) {
    savePendingInvite(fromLink);
    const url = new URL(window.location.href);
    url.searchParams.delete('convite');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return fromLink;
  }
  return readPendingInvite();
}
