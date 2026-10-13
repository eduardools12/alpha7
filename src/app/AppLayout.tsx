import { useEffect, useRef } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { useAccess } from '@/auth/AccessContext';
import { hasRealData } from '@/data/backup';
import { useBackupStatus } from '@/data/useBackupStatus';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { FirstUseScreen, RecoveryScreen } from '@/features/startup/StartupScreens';
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
  const { status, data, persistent, integrityProblems, backend } = useWorkspace();
  const access = useAccess();
  const ready = status === 'ready';
  const hasDemo =
    ready &&
    (data.players.some((p) => p.demo) || data.lineups.some((l) => l.demo) || data.trainings.some((t) => t.demo) || data.activity !== null);
  // Misturar demonstração com dados da equipe distorce médias e totais: fica explícito, nunca silencioso.
  const mixed = hasDemo && hasRealData(data);

  return (
    <div className={styles.banners}>
      {hasDemo && (
        <Notice tone={mixed ? 'warning' : 'info'} title={mixed ? 'Demonstração misturada com dados da equipe' : 'Dados de demonstração'}>
          <span className={styles.long}>
            {mixed
              ? 'Este workspace tem registros fictícios (marcados como “Demo”) junto com registros criados pela equipe, e os totais e médias somam os dois. '
              : 'Atletas, notas, treinos e partidas marcados como “Demo” são fictícios e não representam resultados reais do Alpha7. '}
          </span>
          <Link to={`${PATHS.settings}#dados`}>Gerenciar dados</Link>
        </Notice>
      )}
      {ready && integrityProblems > 0 && (
        <Notice tone="warning" title="Os dados salvos têm inconsistências">
          A verificação encontrou {integrityProblems} {integrityProblems === 1 ? 'problema' : 'problemas'} (por exemplo, vínculos
          quebrados entre registros). Nada foi alterado.{' '}
          <Link to={`${PATHS.settings}#dados`}>Verificar integridade</Link>
        </Notice>
      )}
      {ready && access.readOnly && (
        <Notice tone="info" title="Acesso somente leitura">
          Seu papel permite consultar os dados da equipe, mas não alterá-los. Os botões de edição ficam desativados ou ocultos.
        </Notice>
      )}
      {ready && backend === 'local' && <BackupReminder />}
      {!persistent && backend === 'local' && (
        <Notice tone="warning" title="Armazenamento do navegador indisponível">
          As alterações valem só até recarregar a página. Exporte um backup antes de fechar.
        </Notice>
      )}
    </div>
  );
}

/** Mostra carregamento, início, recuperação ou erro antes de qualquer tela; só renderiza a rota quando há dados. */
function WorkspaceGate() {
  const { status, error, actions } = useWorkspace();

  if (status === 'loading') return <LoadingBlock label="Abrindo os dados da equipe…" />;
  if (status === 'setup') return <FirstUseScreen />;
  if (status === 'recovery') return <RecoveryScreen />;

  if (status === 'error') {
    return (
      <Notice tone="error" title="Não foi possível abrir os dados" action={<Button onClick={() => void actions.reload()}>Tentar de novo</Button>}>
        {error}
      </Notice>
    );
  }

  return <Outlet />;
}

export function AppLayout() {
  const { status } = useWorkspace();
  // Ao sair da tela de início ou de recuperação, o botão clicado desaparece e o foco do teclado se perderia:
  // leva o foco para o conteúdo principal.
  const previous = useRef(status);
  useEffect(() => {
    if ((previous.current === 'setup' || previous.current === 'recovery') && status === 'ready') {
      document.getElementById('conteudo')?.focus();
    }
    previous.current = status;
  }, [status]);

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
