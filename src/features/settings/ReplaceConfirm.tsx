import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { useBackupStatus } from '@/data/useBackupStatus';
import { BackupStatusLine } from './BackupStatusLine';
import { describeOrigin, describeSummary } from './describeSummary';
import { useBackupExport } from './useBackupExport';
import styles from './ReplaceConfirm.module.css';

interface ReplaceConfirmProps {
  title: string;
  /** O que vai acontecer, em frases curtas. */
  impact: string[];
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmação explícita antes de SUBSTITUIR o workspace (restaurar demonstração, apagar tudo).
 * Mostra o que existe hoje, o que será perdido, a situação do backup e oferece exportar um agora.
 * Com dados criados pela equipe, exige marcar que entendeu a substituição.
 */
export function ReplaceConfirm({ title, impact, confirmLabel, busy, onConfirm, onCancel }: ReplaceConfirmProps) {
  const status = useBackupStatus();
  const exporter = useBackupExport();
  const [understood, setUnderstood] = useState(false);
  const needsAck = status.hasRealData;

  return (
    <section className={styles.panel} aria-label={title}>
      <Notice tone="warning" title={title}>
        <ul className={styles.list}>
          {impact.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className={styles.now}>
          Hoje o workspace tem {describeSummary(status.summary)} ({describeOrigin(status.summary)}).
        </p>
      </Notice>

      <div className={styles.backup}>
        <p>
          <strong>Recomendado: exporte um backup antes.</strong> Uma cópia de segurança automática guarda só a última substituição;
          o arquivo de backup fica com você.
        </p>
        <div className={styles.status}>
          <BackupStatusLine status={status} />
        </div>
        <Button icon="save" disabled={exporter.busy} onClick={() => void exporter.exportNow()}>
          {exporter.busy ? 'Exportando…' : 'Exportar backup agora'}
        </Button>
        {exporter.message && (
          <Notice tone={exporter.message.tone}>
            {exporter.message.text}
            {exporter.message.problems && (
              <ul className={styles.list}>
                {exporter.message.problems.slice(0, 5).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}
      </div>

      {needsAck && (
        <label className={styles.ack}>
          <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
          <span>Entendi que os dados atuais, inclusive os que a equipe cadastrou, serão substituídos.</span>
        </label>
      )}

      <div className={styles.actions}>
        <Button variant="danger" icon="trash" disabled={busy || (needsAck && !understood)} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}
