import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './routes';

const BASE_TITLE = 'Alpha7 Volleyball Performance';

function titleFor(pathname: string): string {
  const item = NAV_ITEMS.filter((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))).at(0);
  return item ? `${item.label} · ${BASE_TITLE}` : BASE_TITLE;
}

/**
 * Efeitos de navegação em página única: título da aba, rolagem ao topo (ou até a âncora)
 * e foco no conteúdo para que leitores de tela percebam a troca de tela.
 *
 * O foco só é movido quando o caminho realmente muda. Comparar com o caminho anterior (e
 * não usar um "primeira vez" booleano) mantém o comportamento correto no StrictMode, que
 * executa efeitos duas vezes no desenvolvimento.
 */
export function RouteEffects() {
  const { pathname, hash } = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    document.title = titleFor(pathname);
    const previous = lastPath.current;
    lastPath.current = pathname;

    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
    if (previous !== null && previous !== pathname) {
      document.getElementById('conteudo')?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);

  return null;
}
