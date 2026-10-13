import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { summarizeWorkspace } from '@/data/backup';
import { useBackupStatus } from '@/data/useBackupStatus';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { BackupImport } from './BackupImport';
import { BackupStatusLine } from './BackupStatusLine';
import { useBackupExport } from './useBackupExport';
import styles from './BackupPanel.module.css';

/**
 * Backup e restauração do workspace INTEIRO.
 * Importar nunca altera nada até a confirmação explícita; arquivo inválido é rejeitado por inteiro.
 */
export function BackupPanel() {
  const { data, backend } = useWorkspace();
  const status = useBackupStatus();
  const exporter = useBackupExport();

  return (
    <Card title="Backup e restauração" id="backup">
      <p className={styles.muted}>
        O backup é um arquivo JSON com o workspace inteiro (atletas, avaliações e histórico, escalações, treinos, exercícios,
        participantes, registros de desempenho e configurações). Ele é gerado e guardado só no seu computador. Não contém senhas
        nem chaves, mas também <strong>não é criptografado</strong>: trate-o como dado da equipe.
      </p>

      <div className={styles.block}>
        <h3 className={styles.heading}>Exportar</h3>
        <BackupStatusLine status={status} />
        <div>
          <Button variant="primary" icon="save" disabled={exporter.busy} onClick={() => void exporter.exportNow()}>
            {exporter.busy ? 'Exportando…' : 'Exportar backup'}
          </Button>
        </div>
        {exporter.message && (
          <Notice tone={exporter.message.tone} title={exporter.message.tone === 'error' ? 'Backup não gerado' : 'Backup exportado'}>
            {exporter.message.text}
            {exporter.message.problems && (
              <ul className={styles.problems}>
                {exporter.message.problems.slice(0, 8).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            {exporter.message.offerRaw && (
              <div className={styles.rawAction}>
                <Button size="sm" onClick={() => void exporter.downloadRaw()}>
                  Baixar cópia bruta dos dados
                </Button>
              </div>
            )}
          </Notice>
        )}
      </div>

      <div className={styles.block}>
        <h3 className={styles.heading}>Restaurar de um arquivo</h3>
        {backend === 'remote' ? (
          <Notice tone="info" title="Restaurar backup não está disponível com os dados na nuvem">
            Nesta fase, o aplicativo não substitui os dados da equipe no servidor por um arquivo: isso apagaria o histórico de todos os
            integrantes sem volta. Exportar continua funcionando e gera uma cópia do que está na nuvem agora. A importação segura dos
            backups para a nuvem é uma etapa futura.
          </Notice>
        ) : (
          <>
            <p className={styles.muted}>
              Escolha um backup exportado pelo Alpha7. O arquivo é verificado por inteiro antes de qualquer mudança, e nada é alterado
              até você confirmar.
            </p>
            <BackupImport mode="replace" current={summarizeWorkspace(data)} />
          </>
        )}
      </div>
    </Card>
  );
}
