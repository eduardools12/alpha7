import { useWorkspace } from '@/data/WorkspaceProvider';
import { useOnlineStatus } from '@/pwa/hooks';
import { Notice } from './Notice';

/**
 * true quando os dados ficam na nuvem E o aparelho está sem rede: nada será gravado até a conexão voltar.
 * No modo local nunca é verdadeiro (os dados ficam no próprio aparelho, então registrar funciona sem internet).
 */
export function useCloudOffline(): boolean {
  const { backend } = useWorkspace();
  const online = useOnlineStatus();
  return backend === 'remote' && !online;
}

/**
 * Aviso de falta de conexão nas telas de registro (partida ao vivo, registro de treino). Diz com franqueza que NADA fica
 * guardado no aparelho para enviar depois: o placar é calculado no servidor e uma fila local poderia divergir dele.
 */
export function ConnectionNotice() {
  if (!useCloudOffline()) return null;
  return (
    <Notice compact tone="warning" title="Sem conexão com a nuvem">
      Os registros não estão sendo gravados e nada fica guardado no aparelho para enviar depois. Espere a conexão voltar antes de continuar.
    </Notice>
  );
}
