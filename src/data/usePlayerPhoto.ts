import { useEffect, useRef, useState } from 'react';
import { isDataUrl } from '@/domain/photo';
import { useWorkspace } from './WorkspaceProvider';

/**
 * Endereço da foto de um atleta para usar num <img>, ou null (sem foto, carregando ou com falha: quem desenha mostra o
 * avatar padrão). Foto local (data URL) é imediata; foto da nuvem pede uma URL assinada, guardada em cache.
 * Todas as telas usam este mesmo caminho: a foto exibida é sempre a mesma que está cadastrada.
 */
export function usePlayerPhotoUrl(reference: string | undefined): string | null {
  const { actions } = useWorkspace();
  const resolve = useRef(actions.photoUrl);
  resolve.current = actions.photoUrl;
  const [resolved, setResolved] = useState<{ reference: string; url: string } | null>(null);

  useEffect(() => {
    if (!reference || isDataUrl(reference)) return;
    let alive = true;
    resolve
      .current(reference)
      .then((url) => alive && setResolved({ reference, url }))
      .catch(() => alive && setResolved(null));
    return () => {
      alive = false;
    };
  }, [reference]);

  if (!reference) return null;
  if (isDataUrl(reference)) return reference;
  return resolved?.reference === reference ? resolved.url : null;
}
