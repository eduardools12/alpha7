import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireCapability } from '@/auth/AccessContext';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LineupEditorPage } from '@/features/lineup/LineupEditorPage';
import { LineupListPage } from '@/features/lineup/LineupListPage';
import { MatchesPage, StatsPage } from '@/features/placeholders/ComingSoonPage';
import { NotFoundPage } from '@/features/placeholders/NotFoundPage';
import { EvaluationPage } from '@/features/roster/EvaluationPage';
import { PlayerFormPage } from '@/features/roster/PlayerFormPage';
import { PlayerProfilePage } from '@/features/roster/PlayerProfilePage';
import { RosterPage } from '@/features/roster/RosterPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TrainingFormPage } from '@/features/trainings/TrainingFormPage';
import { TrainingRecordPage } from '@/features/trainings/TrainingRecordPage';
import { TrainingSummaryPage } from '@/features/trainings/TrainingSummaryPage';
import { TrainingsListPage } from '@/features/trainings/TrainingsListPage';
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
    <BrowserRouter>
      <BackendRoot>
        <AppRoutes />
      </BackendRoot>
    </BrowserRouter>
  );
}
