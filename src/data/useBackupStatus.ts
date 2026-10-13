import { useDeferredValue, useMemo } from 'react';
import { summarizeWorkspace, workspaceFingerprint, type WorkspaceSummary } from './backup';
import { useWorkspace } from './WorkspaceProvider';
import type { LastBackup } from './backupMeta';

export interface BackupStatus {
  summary: WorkspaceSummary;
  hasRealData: boolean;
  lastBackup: LastBackup | null;
  /** true se nunca houve backup OU se os dados mudaram desde o último. */
  changedSinceBackup: boolean;
  /** Dias desde o último backup exportado; null se nunca. */
  daysSinceBackup: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Situação do backup do workspace atual. A impressão digital é calculada de forma adiada (não trava
 * toques e digitação). Com `onlyWithRealData`, nem chega a calculá-la enquanto só há demonstração.
 */
export function useBackupStatus({ onlyWithRealData = false } = {}): BackupStatus {
  const { data, lastBackup } = useWorkspace();
  const deferred = useDeferredValue(data);
  const summary = useMemo(() => summarizeWorkspace(data), [data]);
  const hasRealData = summary.realRecords > 0;
  const fingerprint = useMemo(
    () => (onlyWithRealData && !hasRealData ? null : workspaceFingerprint(deferred)),
    [deferred, onlyWithRealData, hasRealData],
  );
  return {
    summary,
    hasRealData,
    lastBackup,
    changedSinceBackup: lastBackup === null || fingerprint === null || lastBackup.fingerprint !== fingerprint,
    daysSinceBackup: lastBackup === null ? null : Math.max(0, Math.floor((Date.now() - Date.parse(lastBackup.at)) / DAY_MS)),
  };
}
