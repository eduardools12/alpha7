import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { WorkspaceProvider } from '@/data/WorkspaceProvider';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LineupEditorPage } from '@/features/lineup/LineupEditorPage';
import { LineupListPage } from '@/features/lineup/LineupListPage';
import { MatchesPage, StatsPage, TrainingsPage } from '@/features/placeholders/ComingSoonPage';
import { NotFoundPage } from '@/features/placeholders/NotFoundPage';
import { EvaluationPage } from '@/features/roster/EvaluationPage';
import { PlayerFormPage } from '@/features/roster/PlayerFormPage';
import { PlayerProfilePage } from '@/features/roster/PlayerProfilePage';
import { RosterPage } from '@/features/roster/RosterPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AppLayout } from './AppLayout';
import { RouteEffects } from './RouteEffects';

/** Rotas separadas do roteador para que os testes possam usar MemoryRouter. */
export function AppRoutes() {
  return (
    <>
      <RouteEffects />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="elenco" element={<RosterPage />} />
          <Route path="elenco/novo" element={<PlayerFormPage />} />
          <Route path="elenco/:playerId" element={<PlayerProfilePage />} />
          <Route path="elenco/:playerId/editar" element={<PlayerFormPage />} />
          <Route path="elenco/:playerId/avaliar" element={<EvaluationPage />} />
          <Route path="escalacoes" element={<LineupListPage />} />
          <Route path="escalacoes/nova" element={<LineupEditorPage />} />
          <Route path="escalacoes/:lineupId" element={<LineupEditorPage />} />
          <Route path="treinos" element={<TrainingsPage />} />
          <Route path="partidas" element={<MatchesPage />} />
          <Route path="estatisticas" element={<StatsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

export function App() {
  return (
    <WorkspaceProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </WorkspaceProvider>
  );
}
