import { formatInstant } from '@/domain/format';
import type { BackupStatus } from '@/data/useBackupStatus';

/** Uma frase direta sobre o último backup, sem alarmismo e sem esconder a situação. */
export function backupStatusText(status: BackupStatus): string {
  if (!status.lastBackup) return 'Nenhum backup foi exportado neste navegador ainda.';
  const when = formatInstant(status.lastBackup.at);
  return status.changedSinceBackup
    ? `Último backup: ${when}. Houve alterações desde então.`
    : `Último backup: ${when}. Nenhuma alteração desde então.`;
}

export function BackupStatusLine({ status }: { status: BackupStatus }) {
  return <p>{backupStatusText(status)}</p>;
}
