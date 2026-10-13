import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireCapability } from '@/auth/AccessContext';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { NotFoundPage } from '@/features/placeholders/NotFoundPage';
import { RosterPage } from '@/features/roster/RosterPage';
import { lazyPage } from './lazyPage';

// Dashboard e elenco abrem junto com o aplicativo. As demais telas são baixadas quando alguém as abre (e o service worker já
// as guarda na instalação, então também abrem sem internet). O gerador de artes e as estatísticas carregam ainda mais coisa
// (fontes e logo embutidos, gráficos).
const LineupEditorPage = lazyPage(() => import('@/features/lineup/LineupEditorPage'), 'LineupEditorPage');
const LineupListPage = lazyPage(() => import('@/features/lineup/LineupListPage'), 'LineupListPage');
const MatchDetailPage = lazyPage(() => import('@/features/matches/MatchDetailPage'), 'MatchDetailPage');
const MatchFormPage = lazyPage(() => import('@/features/matches/MatchFormPage'), 'MatchFormPage');
const MatchLivePage = lazyPage(() => import('@/features/matches/MatchLivePage'), 'MatchLivePage');
const MatchesListPage = lazyPage(() => import('@/features/matches/MatchesListPage'), 'MatchesListPage');
const EvaluationPage = lazyPage(() => import('@/features/roster/EvaluationPage'), 'EvaluationPage');
const PlayerFormPage = lazyPage(() => import('@/features/roster/PlayerFormPage'), 'PlayerFormPage');
const PlayerProfilePage = lazyPage(() => import('@/features/roster/PlayerProfilePage'), 'PlayerProfilePage');
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const TrainingFormPage = lazyPage(() => import('@/features/trainings/TrainingFormPage'), 'TrainingFormPage');
const TrainingRecordPage = lazyPage(() => import('@/features/trainings/TrainingRecordPage'), 'TrainingRecordPage');
const TrainingSummaryPage = lazyPage(() => import('@/features/trainings/TrainingSummaryPage'), 'TrainingSummaryPage');
const TrainingsListPage = lazyPage(() => import('@/features/trainings/TrainingsListPage'), 'TrainingsListPage');
const StatsPage = lazyPage(() => import('@/features/stats/StatsPage'), 'StatsPage');
const ArtsPage = lazyPage(() => import('@/features/arts/ArtsPage'), 'ArtsPage');

import { AppLayout } from './AppLayout';
import { BackendRoot } from './BackendRoot';
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
          <Route path="elenco/novo" element={<RequireCapability capability="players:write"><PlayerFormPage /></RequireCapability>} />
          <Route path="elenco/:playerId" element={<PlayerProfilePage />} />
          <Route path="elenco/:playerId/editar" element={<RequireCapability capability="players:write"><PlayerFormPage /></RequireCapability>} />
          <Route path="elenco/:playerId/avaliar" element={<RequireCapability capability="evaluations:add"><EvaluationPage /></RequireCapability>} />
          <Route path="escalacoes" element={<LineupListPage />} />
          <Route path="escalacoes/nova" element={<RequireCapability capability="lineups:write"><LineupEditorPage /></RequireCapability>} />
          <Route path="escalacoes/:lineupId" element={<LineupEditorPage />} />
          <Route path="treinos" element={<TrainingsListPage />} />
          <Route path="treinos/novo" element={<RequireCapability capability="trainings:write"><TrainingFormPage /></RequireCapability>} />
          <Route path="treinos/:trainingId" element={<TrainingSummaryPage />} />
          <Route path="treinos/:trainingId/editar" element={<RequireCapability capability="trainings:write"><TrainingFormPage /></RequireCapability>} />
          <Route path="treinos/:trainingId/registrar" element={<RequireCapability capability="events:record"><TrainingRecordPage /></RequireCapability>} />
          <Route path="partidas" element={<MatchesListPage />} />
          <Route path="partidas/nova" element={<RequireCapability capability="matches:write"><MatchFormPage /></RequireCapability>} />
          <Route path="partidas/:matchId" element={<MatchDetailPage />} />
          <Route path="partidas/:matchId/editar" element={<RequireCapability capability="matches:write"><MatchFormPage /></RequireCapability>} />
          <Route path="partidas/:matchId/acompanhar" element={<RequireCapability capability="matches:write"><MatchLivePage /></RequireCapability>} />
          <Route path="estatisticas" element={<StatsPage />} />
          <Route path="artes" element={<RequireCapability capability="arts:generate"><ArtsPage /></RequireCapability>} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <BackendRoot>
        <AppRoutes />
      </BackendRoot>
    </BrowserRouter>
  );
}
