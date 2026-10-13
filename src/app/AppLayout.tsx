import { Link, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { MobileNav, MobileTopBar } from './MobileNav';
import { Sidebar } from './Sidebar';
import { PATHS } from './routes';
import styles from './AppLayout.module.css';

function DemoBanner() {
  const { data, persistent } = useWorkspace();
  const hasDemo =
    data.players.some((p) => p.demo) || data.lineups.some((l) => l.demo) || data.activity !== null;

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
      {!persistent && (
        <Notice tone="warning" title="Armazenamento do navegador indisponível">
          As alterações valem só até recarregar a página.
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
    return (
      <Notice
        tone="error"
        title="Não foi possível abrir os dados"
        action={
          corrupted ? (
            <Button variant="danger" onClick={() => void actions.restoreDemo()}>
              Recomeçar com dados de demonstração
            </Button>
          ) : (
            <Button onClick={() => void actions.reload()}>Tentar de novo</Button>
          )
        }
      >
        {error}
        {corrupted && ' Uma cópia dos dados antigos foi mantida no navegador antes de recomeçar.'}
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
