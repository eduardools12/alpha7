import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { useBackupStatus } from '@/data/useBackupStatus';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { useBackupExport } from '@/features/settings/useBackupExport';
import { MobileNav, MobileTopBar } from './MobileNav';
import { Sidebar } from './Sidebar';
import { PATHS } from './routes';
import styles from './AppLayout.module.css';

/** Dias sem backup (com alterações desde o último) a partir dos quais o lembrete aparece. */
const REMINDER_DAYS = 7;

/** Lembrete de backup: só aparece quando existem dados da equipe e eles estão sem proteção recente. */
function BackupReminder() {
  const status = useBackupStatus({ onlyWithRealData: true });
  if (!status.hasRealData) return null;
  const never = status.lastBackup === null;
  const stale = status.changedSinceBackup && (status.daysSinceBackup ?? 0) >= REMINDER_DAYS;
  if (!never && !stale) return null;
  return (
    <Notice tone="info" title="Faça um backup dos dados da equipe">
      {never
        ? 'Os dados cadastrados ficam só neste navegador e ainda não há nenhum backup. '
        : `O último backup foi há ${status.daysSinceBackup} dias e houve alterações desde então. `}
      <Link to={`${PATHS.settings}#backup`}>Exportar backup</Link>
    </Notice>
  );
}

function DemoBanner() {
  const { data, persistent } = useWorkspace();
  const hasDemo =
    data.players.some((p) => p.demo) || data.lineups.some((l) => l.demo) || data.trainings.some((t) => t.demo) || data.activity !== null;

  return (
    <div className={styles.banners}>
      {hasDemo && (
        <Notice tone="info" title="Dados de demonstração">
          <span className={styles.long}>
            Atletas, notas, treinos e partidas marcados como “Demo” são fictícios e não representam resultados reais do
            Alpha7.{' '}
          </span>
          <Link to={`${PATHS.settings}#dados`}>Gerenciar dados</Link>
        </Notice>
      )}
      <BackupReminder />
      {!persistent && (
        <Notice tone="warning" title="Armazenamento do navegador indisponível">
          As alterações valem só até recarregar a página. Exporte um backup antes de fechar.
        </Notice>
      )}
    </div>
  );
}

/**
 * Dados ilegíveis: nada é apagado sozinho. A pessoa pode baixar uma cópia do conteúdo antes de
 * recomeçar, e recomeçar exige confirmação explícita (o conteúdo antigo ainda fica numa cópia interna).
 */
function CorruptedRecovery({ message }: { message: string | null }) {
  const { actions } = useWorkspace();
  const exporter = useBackupExport();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const restart = async () => {
    setBusy(true);
    try {
      await actions.restoreDemo();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível recomeçar.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.recovery}>
      <Notice tone="error" title="Não foi possível abrir os dados">
        {message} Os dados não foram apagados: continuam guardados neste navegador. Antes de recomeçar, baixe uma cópia deles.
      </Notice>
      <div className={styles.recoveryActions}>
        <Button icon="save" onClick={() => void exporter.downloadRaw()}>
          Baixar cópia dos dados ilegíveis
        </Button>
        {!confirming && (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Recomeçar com dados de demonstração
          </Button>
        )}
      </div>
      {exporter.message && <Notice tone={exporter.message.tone}>{exporter.message.text}</Notice>}
      {failure && <Notice tone="error">{failure}</Notice>}
      {confirming && (
        <Notice tone="warning" title="Recomeçar com a demonstração?">
          Os dados ilegíveis serão substituídos pela demonstração. O conteúdo antigo continua guardado como cópia de segurança interna,
          mas só até a próxima substituição: baixe a cópia antes se ele for importante.
          <div className={styles.recoveryActions}>
            <Button variant="danger" disabled={busy} onClick={() => void restart()}>
              Confirmar: recomeçar com demonstração
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </Notice>
      )}
    </div>
  );
}

/** Mostra carregamento ou erro de dados antes de qualquer tela; só renderiza a rota quando há dados. */
function WorkspaceGate() {
  const { status, error, corrupted, actions } = useWorkspace();

  if (status === 'loading') return <LoadingBlock label="Abrindo os dados da equipe…" />;

  if (status === 'error') {
    return corrupted ? (
      <CorruptedRecovery message={error} />
    ) : (
      <Notice tone="error" title="Não foi possível abrir os dados" action={<Button onClick={() => void actions.reload()}>Tentar de novo</Button>}>
        {error}
      </Notice>
    );
  }

  return <Outlet />;
}

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <a href="#conteudo" className={styles.skip}>
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className={styles.column}>
        <MobileTopBar />
        <main id="conteudo" className={styles.main} tabIndex={-1}>
          <DemoBanner />
          <WorkspaceGate />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
