import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { downloadTextFile } from '@/data/download';
import type { RawCopy } from '@/data/gateway';
import { useWorkspace, type StartKind } from '@/data/WorkspaceProvider';
import { formatInstant } from '@/domain/format';
import { BackupImport } from '@/features/settings/BackupImport';
import { describeSummary } from '@/features/settings/describeSummary';
import styles from './StartupScreens.module.css';

const START_LABEL: Record<StartKind, string> = { empty: 'workspace vazio', demo: 'dados de demonstração' };

function stamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Executa um início de workspace e mostra a falha (sem alterar nada) se o navegador recusar a gravação. */
function useStart() {
  const { actions } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const start = async (kind: StartKind) => {
    setBusy(true);
    setFailure(null);
    try {
      await actions.startNew(kind);
    } catch (error) {
      setFailure(`${error instanceof Error ? error.message : 'Não foi possível começar.'} Nada foi alterado.`);
      setBusy(false);
    }
  };
  return { busy, failure, start };
}

/**
 * Primeira utilização: nenhum sinal de que existiu um workspace. Nada é criado até a pessoa escolher.
 * (Se o navegador apagou TODOS os dados do site, o caso é igual a este: ver docs/DATA_SAFETY.md.)
 */
export function FirstUseScreen() {
  const { persistent } = useWorkspace();
  const { busy, failure, start } = useStart();

  return (
    <div className={styles.screen}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Como você quer começar?</h1>
        <p className={styles.lead}>
          Ainda não há dados neste navegador. Escolha como abrir o Alpha7: nada é criado antes da sua escolha.
        </p>
        <p className={styles.muted}>
          {persistent
            ? 'Os dados ficam salvos só neste navegador, sem enviar nada a servidores. Depois de cadastrar o elenco, exporte backups em Configurações.'
            : 'O armazenamento do navegador está indisponível: o que você fizer vale só até recarregar a página.'}
        </p>
      </header>

      {failure && <Notice tone="error" title="Não foi possível começar">{failure}</Notice>}

      <div className={styles.options}>
        <Card title="Começar com workspace vazio">
          <p className={styles.muted}>Para cadastrar o elenco e os treinos reais da equipe. Nenhum dado fictício é criado.</p>
          <div>
            <Button variant="primary" disabled={busy} onClick={() => void start('empty')}>
              Começar com workspace vazio
            </Button>
          </div>
        </Card>

        <Card title="Começar com dados de demonstração">
          <p className={styles.muted}>
            Atletas, avaliações, treinos e partidas <strong>fictícios</strong>, para conhecer o aplicativo. Tudo aparece marcado como
            “Demo”, não representa resultados reais do Alpha7 e pode ser apagado depois em Configurações.
          </p>
          <div>
            <Button disabled={busy} onClick={() => void start('demo')}>
              Começar com dados de demonstração
            </Button>
          </div>
        </Card>

        <Card title="Restaurar de um backup" className={styles.wide}>
          <p className={styles.muted}>
            Já usa o Alpha7 em outro navegador ou computador? Escolha o arquivo de backup exportado por ele. O arquivo é verificado por
            inteiro e nada é gravado até você confirmar.
          </p>
          <BackupImport mode="startup" />
        </Card>
      </div>
    </div>
  );
}

/**
 * Os dados da equipe sumiram (há sinais de uso anterior) ou estão ilegíveis. NADA é criado em silêncio:
 * a pessoa importa um backup, baixa o que existir, tenta de novo ou, só depois de confirmar, começa um workspace novo.
 */
export function RecoveryScreen() {
  const { recoveryReason, error, snapshot, actions } = useWorkspace();
  const { busy, failure, start } = useStart();
  const [copies, setCopies] = useState<RawCopy[] | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoringSnapshot, setRestoringSnapshot] = useState(false);

  const refreshCopies = useCallback(() => {
    actions
      .recoveryCopies()
      .then(setCopies)
      .catch(() => setCopies([]));
  }, [actions]);

  useEffect(() => {
    refreshCopies();
  }, [refreshCopies]);

  const unreadable = recoveryReason === 'unreadable';

  const download = (copy: RawCopy) => {
    downloadTextFile(`alpha7-dados-brutos-${copy.id}-${stamp()}.txt`, copy.text, 'text/plain');
    setNotice({
      tone: 'success',
      text: `“${copy.label}” baixado. Não é um backup restaurável pelo aplicativo, mas preserva o conteúdo para recuperação manual.`,
    });
  };

  const restoreAutomatic = async () => {
    setRestoringSnapshot(true);
    setNotice(null);
    try {
      await actions.undoLastReplacement();
    } catch (cause) {
      setNotice({ tone: 'error', text: `${cause instanceof Error ? cause.message : 'Não foi possível restaurar a cópia.'} Nada foi alterado.` });
      setRestoringSnapshot(false);
    }
  };

  return (
    <div className={styles.screen}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Recuperar os dados da equipe</h1>
      </header>

      <Notice tone="error" title={unreadable ? 'Os dados salvos estão ilegíveis' : 'Os dados da equipe não foram encontrados'}>
        {unreadable ? (
          <>
            {error} Os dados não foram apagados: continuam guardados neste navegador.
          </>
        ) : (
          <>
            Este navegador mostra sinais de que o Alpha7 já foi usado aqui (cópia de segurança, backup registrado ou marca de uso), mas
            o workspace não está mais salvo. Isso acontece, por exemplo, quando os dados do site são limpos pelo navegador.
          </>
        )}{' '}
        Por segurança, <strong>nenhum dado de demonstração foi criado no lugar</strong> e nada será substituído sem a sua decisão.
      </Notice>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {failure && <Notice tone="error" title="Não foi possível começar">{failure}</Notice>}

      <div className={styles.options}>
        <Card title="Importar um backup" className={styles.wide}>
          <p className={styles.muted}>
            A melhor saída: escolha o último arquivo <code>alpha7-backup-….json</code> exportado. Ele é verificado por inteiro e nada
            é gravado até você confirmar.
          </p>
          <BackupImport mode="startup" />
        </Card>

        {snapshot && (
          <Card title="Cópia de segurança automática">
            <p className={styles.muted}>
              Guardada em {formatInstant(snapshot.savedAt)} ({snapshot.reason}).
              {snapshot.summary ? ` Continha ${describeSummary(snapshot.summary)}.` : ' O conteúdo guardado não pôde ser resumido.'}
            </p>
            <div>
              <Button icon="rotate" disabled={restoringSnapshot} onClick={() => void restoreAutomatic()}>
                Restaurar a cópia de segurança automática
              </Button>
            </div>
          </Card>
        )}

        <Card title="Baixar os dados brutos">
          {copies === null ? (
            <p className={styles.muted}>Procurando o que ainda existe neste navegador…</p>
          ) : copies.length === 0 ? (
            <p className={styles.muted}>Não há dados brutos guardados neste navegador para baixar.</p>
          ) : (
            <>
              <p className={styles.muted}>
                Textos que ainda existem aqui. Não são backups restauráveis pelo aplicativo, mas permitem recuperar o conteúdo à mão.
              </p>
              <ul className={styles.copies}>
                {copies.map((copy) => (
                  <li key={copy.id}>
                    <Button icon="save" onClick={() => download(copy)}>
                      Baixar: {copy.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Tentar novamente">
          <p className={styles.muted}>
            Se os dados voltaram (por exemplo, depois de fechar outra aba do Alpha7 ou restaurar o perfil do navegador), leia de novo.
          </p>
          <div>
            <Button icon="rotate" onClick={() => void actions.reload()}>
              Tentar novamente
            </Button>
          </div>
        </Card>

        <Card title="Começar um workspace novo" className={styles.wide}>
          {!confirming ? (
            <>
              <p className={styles.muted}>
                Só use se não há backup nem cópia a recuperar. Você poderá escolher entre um workspace vazio e a demonstração, depois de
                confirmar.
              </p>
              <div>
                <Button variant="danger" onClick={() => setConfirming(true)}>
                  Começar um workspace novo…
                </Button>
              </div>
            </>
          ) : (
            <section aria-label="Confirmar workspace novo">
              <Notice tone="warning" title="Começar um workspace novo?">
                <ul className={styles.list}>
                  <li>Um workspace novo será criado; os dados da equipe que ainda não foram recuperados não voltam sozinhos.</li>
                  {unreadable && (
                    <li>
                      O conteúdo ilegível continua guardado como cópia de segurança interna, mas só até a próxima substituição: baixe-o
                      antes se for importante.
                    </li>
                  )}
                  <li>Se você tiver um backup, importe-o em vez disso: ele traz tudo de volta.</li>
                </ul>
              </Notice>
              <div className={styles.actions}>
                <Button variant="danger" disabled={busy} onClick={() => void start('empty')}>
                  Confirmar: começar com {START_LABEL.empty}
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => void start('demo')}>
                  Confirmar: começar com {START_LABEL.demo}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
              </div>
            </section>
          )}
        </Card>
      </div>
    </div>
  );
}
