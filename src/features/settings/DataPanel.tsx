import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import type { StorageUsage } from '@/data/gateway';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { formatInstant } from '@/domain/format';
import { summarizeWorkspace } from '@/data/backup';
import { describeOrigin, describeSummary } from './describeSummary';
import { ReplaceConfirm } from './ReplaceConfirm';
import styles from './DataPanel.module.css';

type Pending = 'demo' | 'clear' | 'undo' | null;
type Persisted = 'sim' | 'nao' | 'indisponivel' | null;

function usePersisted(): Persisted {
  const [persisted, setPersisted] = useState<Persisted>(null);
  useEffect(() => {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persisted) {
      setPersisted('indisponivel');
      return;
    }
    storage
      .persisted()
      .then((value) => setPersisted(value ? 'sim' : 'nao'))
      .catch(() => setPersisted('indisponivel'));
  }, []);
  return persisted;
}

const USAGE_WARN_RATIO = 0.7;

function formatKb(chars: number): string {
  // O navegador conta caracteres; ~1 caractere ≈ 1 byte para estes dados (JSON em maioria ASCII).
  return chars < 1_000_000 ? `${Math.max(1, Math.round(chars / 1000))} mil caracteres` : `${(chars / 1_000_000).toFixed(1).replace('.', ',')} milhões de caracteres`;
}

const PERSISTED_TEXT: Record<Exclude<Persisted, null>, string> = {
  sim: 'Armazenamento protegido: o navegador se comprometeu a não apagar estes dados sozinho.',
  nao: 'Armazenamento não protegido: com pouco espaço, o navegador pode apagar estes dados por conta própria. Por isso, faça backups.',
  indisponivel: 'Este navegador não informa se o armazenamento é protegido. Faça backups.',
};

/** Dados e armazenamento: onde ficam, o que há, integridade, desfazer substituição, demonstração e limpeza. */
export function DataPanel() {
  const { data, persistent, snapshot, actions, backend } = useWorkspace();
  const remote = backend === 'remote';
  const persisted = usePersisted();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [integrity, setIntegrity] = useState<{ tone: 'success' | 'error'; text: string; problems: string[] } | null>(null);

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  useEffect(() => {
    let active = true;
    actions
      .usage()
      .then((value) => active && setUsage(value))
      .catch(() => active && setUsage(null));
    return () => {
      active = false;
    };
  }, [actions, data, snapshot]);

  const summary = summarizeWorkspace(data);
  const demoPlayers = data.players.filter((p) => p.demo).length;

  const run = async (kind: Exclude<Pending, null>) => {
    setBusy(true);
    setMessage(null);
    try {
      if (kind === 'demo') await actions.restoreDemo();
      else if (kind === 'clear') await actions.clearAllData();
      else await actions.undoLastReplacement();
      setMessage({
        tone: 'success',
        text:
          kind === 'demo'
            ? 'Dados de demonstração restaurados.'
            : kind === 'clear'
              ? 'Todos os dados foram apagados.'
              : 'Conteúdo anterior restaurado. O conteúdo que estava aqui ficou guardado como cópia de segurança.',
      });
      setPending(null);
      setIntegrity(null);
    } catch (error) {
      setMessage({ tone: 'error', text: `${error instanceof Error ? error.message : 'Não foi possível concluir.'} Nada foi alterado.` });
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setIntegrity(null);
    try {
      const result = await actions.checkIntegrity();
      if (result.ok) {
        const total = summary.players + summary.evaluations + summary.lineups + summary.trainings + summary.exercises + summary.trainingEvents + summary.trainingEventsVoided;
        setIntegrity({ tone: 'success', text: `Nenhum problema encontrado em ${total} registros: formatos, vínculos e duplicidades conferem.`, problems: result.warnings });
      } else {
        setIntegrity({
          tone: 'error',
          text: `Foram encontrados ${result.totalErrors} ${result.totalErrors === 1 ? 'problema' : 'problemas'} nos dados salvos. Exporte uma cópia bruta antes de qualquer outra ação.`,
          problems: result.errors,
        });
      }
    } catch {
      setIntegrity({ tone: 'error', text: 'Não foi possível ler os dados salvos para verificar.', problems: [] });
    }
  };

  return (
    <Card title="Dados e armazenamento" id="dados">
      <p className={styles.muted}>
        {remote
          ? 'Os dados da equipe ficam no servidor (Supabase), e não neste navegador. Todos os integrantes enxergam os mesmos dados, conforme o papel de cada um (as regras são aplicadas pelo banco). Não há cópia de segurança automática nem desfazer: use "Exportar backup" para guardar uma cópia do que está na nuvem.'
          : persistent
            ? 'Os dados ficam salvos só neste navegador (armazenamento local). Eles não são enviados a nenhum servidor e não há sincronização com a nuvem: outro navegador ou aparelho não vê estes dados. Limpar os dados do navegador apaga tudo. O backup é a sua proteção.'
            : 'O armazenamento do navegador está indisponível: os dados valem só até recarregar a página.'}
      </p>
      <p>
        Atualmente: {summary.players} atletas ({demoPlayers} de demonstração), {summary.evaluations} avaliações, {summary.lineups}{' '}
        escalações, {summary.trainings} treinos e {summary.trainingEvents} registros de treino ({describeOrigin(summary)}).
      </p>
      {persisted && persistent && !remote && <p className={styles.muted}>{PERSISTED_TEXT[persisted]}</p>}
      {usage && persistent && !remote && (
        <>
          <p className={styles.muted}>
            Espaço usado no navegador: {formatKb(usage.usedChars)} (dados {formatKb(usage.workspaceChars)}, cópia de segurança{' '}
            {formatKb(usage.snapshotChars)}) de cerca de {formatKb(usage.limitChars)} disponíveis.
          </p>
          {usage.usedChars / usage.limitChars >= USAGE_WARN_RATIO && (
            <Notice tone="warning" title="O armazenamento está ficando cheio">
              Quando acabar o espaço, novos registros deixam de ser salvos. Exporte um backup agora e guarde o arquivo em local seguro.
            </Notice>
          )}
        </>
      )}

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className={styles.block}>
        <h3 className={styles.heading}>Verificar integridade</h3>
        <p className={styles.muted}>Confere os dados salvos agora com as mesmas regras da importação de backup.</p>
        <div>
          <Button onClick={() => void check()}>Verificar integridade dos dados</Button>
        </div>
        {integrity && (
          <Notice tone={integrity.tone}>
            {integrity.text}
            {integrity.problems.length > 0 && (
              <ul className={styles.list}>
                {integrity.problems.slice(0, 10).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}
      </div>

      {snapshot && (
        <div className={styles.block}>
          <h3 className={styles.heading}>Cópia de segurança da última substituição</h3>
          <p className={styles.muted}>
            Antes de cada substituição do workspace (restaurar demonstração, apagar tudo, importar backup) o conteúdo anterior é
            guardado automaticamente. Só a última fica disponível.
          </p>
          <p>
            Guardada em {formatInstant(snapshot.savedAt)} ({snapshot.reason}).
            {snapshot.summary ? ` Continha ${describeSummary(snapshot.summary)}.` : ' O conteúdo guardado não pôde ser resumido.'}
          </p>
          {pending === 'undo' ? (
            <>
              <Notice tone="warning" title="Voltar ao conteúdo anterior?">
                O conteúdo atual será trocado pelo da cópia de segurança. O conteúdo atual também fica guardado, então dá para ir e voltar.
              </Notice>
              <div className={styles.row}>
                <Button variant="danger" icon="rotate" disabled={busy} onClick={() => void run('undo')}>
                  Confirmar: voltar ao conteúdo anterior
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button icon="rotate" onClick={() => setPending('undo')}>
                Desfazer última substituição
              </Button>
            </div>
          )}
        </div>
      )}

      <div className={styles.block}>
        <h3 className={styles.heading}>Demonstração e limpeza</h3>
        {remote ? (
          <Notice tone="info" title="Indisponível com os dados na nuvem">
            Restaurar a demonstração e apagar todos os dados trocam o workspace inteiro. No servidor isso apagaria o histórico de todos os
            integrantes sem volta, então esses recursos existem só com os dados deste navegador.
          </Notice>
        ) : pending === 'demo' ? (
          <ReplaceConfirm
            title="Substituir tudo pela demonstração?"
            impact={[
              'Atletas, avaliações, escalações, treinos e registros atuais serão substituídos pelos dados fictícios de exemplo, inclusive os que a equipe cadastrou.',
              'Os pesos do Overall são mantidos.',
              'O conteúdo atual fica guardado como cópia de segurança para desfazer, mas só até a próxima substituição.',
            ]}
            confirmLabel="Confirmar: substituir tudo pela demonstração"
            busy={busy}
            onConfirm={() => void run('demo')}
            onCancel={() => setPending(null)}
          />
        ) : pending === 'clear' ? (
          <ReplaceConfirm
            title="Apagar todos os dados?"
            impact={[
              'Atletas, avaliações, escalações, treinos, exercícios e registros serão apagados deste navegador.',
              'Os pesos do Overall são mantidos.',
              'O conteúdo atual fica guardado como cópia de segurança para desfazer, mas só até a próxima substituição. Sem backup em arquivo, depois disso não há como recuperar.',
            ]}
            confirmLabel="Confirmar: apagar todos os dados"
            busy={busy}
            onConfirm={() => void run('clear')}
            onCancel={() => setPending(null)}
          />
        ) : (
          <div className={styles.row}>
            <Button onClick={() => setPending('demo')}>Restaurar dados de demonstração</Button>
            <Button variant="danger" icon="trash" onClick={() => setPending('clear')}>
              Apagar todos os dados
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
