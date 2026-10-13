import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { promptInstall } from '@/pwa/installPrompt';
import { useInstallState } from '@/pwa/hooks';
import styles from './SettingsPage.module.css';

/**
 * Instalar o Alpha7 no celular ou no computador (ícone na tela inicial, abre em tela cheia, abre sem internet).
 * Diz com franqueza o que "sem internet" significa em cada modo de dados.
 */
export function InstallPanel() {
  const state = useInstallState();
  const { backend } = useWorkspace();
  const [declined, setDeclined] = useState(false);

  const install = async () => {
    const outcome = await promptInstall();
    setDeclined(outcome === 'dismissed');
  };

  return (
    <Card title="Aplicativo no celular" id="aplicativo">
      {state === 'installed' && (
        <Notice tone="success" title="O Alpha7 está instalado neste aparelho">
          Abra pelo ícone da tela inicial. Atualizações chegam sozinhas e pedem a sua confirmação antes de recarregar.
        </Notice>
      )}

      {state === 'available' && (
        <>
          <p className={styles.muted}>
            Instalado, o Alpha7 ganha um ícone na tela inicial, abre em tela cheia e abre mesmo sem internet. Você pode
            desinstalar quando quiser, como qualquer aplicativo.
          </p>
          <div className={styles.actions}>
            <Button variant="primary" icon="plus" onClick={() => void install()}>
              Instalar o Alpha7
            </Button>
          </div>
        </>
      )}

      {state === 'ios' && (
        <>
          <p className={styles.muted}>No iPhone e no iPad a instalação é feita pelo Safari, em três toques:</p>
          <ol className={styles.steps}>
            <li>Abra o Alpha7 no Safari e toque em Compartilhar (o quadrado com a seta para cima).</li>
            <li>Escolha “Adicionar à Tela de Início”.</li>
            <li>Toque em “Adicionar”.</li>
          </ol>
          <p className={styles.muted}>
            O aplicativo instalado no iPhone guarda a própria sessão: entre com e-mail e senha nele uma vez.
          </p>
        </>
      )}

      {state === 'unavailable' && declined && (
        <p className={styles.muted}>
          Tudo bem. A instalação continua disponível aqui quando você quiser: se o botão não aparecer, use “Instalar aplicativo” no menu
          do navegador.
        </p>
      )}

      {state === 'unavailable' && !declined && (
        <p className={styles.muted}>
          Este navegador não oferece a instalação direta. No menu do navegador procure “Instalar aplicativo” ou “Adicionar à tela
          inicial”. No Chrome e no Edge a opção costuma aparecer ao lado do endereço.
        </p>
      )}

      <Notice tone="info" title="O que funciona sem internet">
        {backend === 'remote'
          ? 'O aplicativo abre, mas os dados da equipe ficam na nuvem: sem conexão não dá para ver nem gravar registros. Nada é gravado em silêncio no aparelho.'
          : 'Os dados ficam neste aparelho, então tudo funciona sem internet: ver o elenco e registrar treinos e partidas. Lembre-se de exportar o backup de vez em quando.'}
      </Notice>
    </Card>
  );
}
