import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { MAX_BACKUP_BYTES, parseBackup, summarizeWorkspace, type ParseBackupResult } from '@/data/backup';
import { useBackupStatus } from '@/data/useBackupStatus';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { formatInstant } from '@/domain/format';
import { BackupStatusLine } from './BackupStatusLine';
import { describeOrigin, describeSummary } from './describeSummary';
import { useBackupExport } from './useBackupExport';
import styles from './BackupPanel.module.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'invalid'; fileName: string; errors: string[]; total: number }
  | { kind: 'preview'; fileName: string; parsed: Extract<ParseBackupResult, { ok: true }> };

const ROWS: { label: string; pick: (s: ReturnType<typeof summarizeWorkspace>) => number }[] = [
  { label: 'Atletas', pick: (s) => s.players },
  { label: 'Avaliações', pick: (s) => s.evaluations },
  { label: 'Escalações', pick: (s) => s.lineups },
  { label: 'Treinos', pick: (s) => s.trainings },
  { label: 'Exercícios', pick: (s) => s.exercises },
  { label: 'Registros de treino válidos', pick: (s) => s.trainingEvents },
  { label: 'Registros de treino desfeitos', pick: (s) => s.trainingEventsVoided },
];

/**
 * Backup e restauração do workspace INTEIRO.
 * Importar nunca altera nada até a confirmação explícita; arquivo inválido é rejeitado por inteiro.
 */
export function BackupPanel() {
  const { data, actions } = useWorkspace();
  const status = useBackupStatus();
  const exporter = useBackupExport();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [understood, setUnderstood] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [inputKey, setInputKey] = useState(0); // recria o campo de arquivo para poder escolher o mesmo arquivo de novo

  const reset = () => {
    setPhase({ kind: 'idle' });
    setUnderstood(false);
    setInputKey((n) => n + 1);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setResult(null);
    setUnderstood(false);
    if (file.size > MAX_BACKUP_BYTES) {
      setPhase({ kind: 'invalid', fileName: file.name, errors: [`O arquivo é grande demais (limite de ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB).`], total: 1 });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setPhase({ kind: 'invalid', fileName: file.name, errors: ['Não foi possível ler o arquivo.'], total: 1 });
      return;
    }
    const parsed = parseBackup(text);
    setPhase(
      parsed.ok
        ? { kind: 'preview', fileName: file.name, parsed }
        : { kind: 'invalid', fileName: file.name, errors: parsed.errors, total: parsed.totalErrors },
    );
  };

  const restore = async () => {
    if (phase.kind !== 'preview') return;
    setRestoring(true);
    try {
      await actions.restoreWorkspace(phase.parsed.workspace, `importação do backup ${phase.fileName}`);
      setResult({
        tone: 'success',
        text: `Backup restaurado: ${describeSummary(phase.parsed.summary)}. O conteúdo anterior ficou guardado como cópia de segurança: use "Desfazer última substituição" em Dados e armazenamento se precisar voltar.`,
      });
      reset();
    } catch (error) {
      setResult({
        tone: 'error',
        text: `${error instanceof Error ? error.message : 'Não foi possível restaurar o backup.'} Nada foi alterado.`,
      });
    } finally {
      setRestoring(false);
    }
  };

  const current = summarizeWorkspace(data);

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
        <p className={styles.muted}>
          Escolha um backup exportado pelo Alpha7. O arquivo é verificado por inteiro antes de qualquer mudança, e nada é alterado
          até você confirmar.
        </p>
        <label className={styles.file}>
          <span>Arquivo de backup (.json)</span>
          <input key={inputKey} type="file" accept=".json,application/json" onChange={(event) => void onFile(event)} />
        </label>

        {result && (
          <Notice tone={result.tone} title={result.tone === 'success' ? 'Restauração concluída' : 'Restauração não realizada'}>
            {result.text}
          </Notice>
        )}

        {phase.kind === 'invalid' && (
          <Notice tone="error" title="Arquivo recusado. Nada foi alterado.">
            <p>
              <strong>{phase.fileName}</strong> não pode ser restaurado ({phase.total} {phase.total === 1 ? 'problema' : 'problemas'}).
            </p>
            <ul className={styles.problems}>
              {phase.errors.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
            {phase.total > phase.errors.length && <p>… e mais {phase.total - phase.errors.length}.</p>}
            <div className={styles.rawAction}>
              <Button size="sm" onClick={reset}>
                Escolher outro arquivo
              </Button>
            </div>
          </Notice>
        )}

        {phase.kind === 'preview' && (
          <section className={styles.preview} aria-label="Prévia do backup">
            <h4 className={styles.previewTitle}>Prévia: {phase.fileName}</h4>
            <p className={styles.muted}>
              Exportado em {formatInstant(phase.parsed.meta.exportedAt)} pelo Alpha7 {phase.parsed.meta.appVersion} (formato v
              {phase.parsed.meta.formatVersion}). Arquivo íntegro e consistente.
            </p>
            <table className={styles.table}>
              <caption className="sr-only">Conteúdo do backup comparado com o workspace atual</caption>
              <thead>
                <tr>
                  <th scope="col">Conteúdo</th>
                  <th scope="col">Backup</th>
                  <th scope="col">Atual</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td className="tabular">{row.pick(phase.parsed.summary)}</td>
                    <td className="tabular">{row.pick(current)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.muted}>
              O backup tem {describeOrigin(phase.parsed.summary)}.
            </p>
            {phase.parsed.warnings.length > 0 && (
              <Notice tone="info" title="Avisos">
                <ul className={styles.problems}>
                  {phase.parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <Notice tone="warning" title="Restaurar substitui TODO o workspace atual">
              Atletas, avaliações, escalações, treinos, exercícios, registros e pesos do Overall de hoje serão trocados pelos do arquivo.
              Uma cópia de segurança automática guarda o conteúdo atual (só desta substituição). Recomendado: exporte um backup do
              workspace atual primeiro.
              <div className={styles.rawAction}>
                <BackupStatusLine status={status} />
                <Button size="sm" icon="save" disabled={exporter.busy} onClick={() => void exporter.exportNow()}>
                  Exportar backup do workspace atual
                </Button>
              </div>
            </Notice>
            <label className={styles.ack}>
              <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
              <span>Entendi que os dados atuais serão substituídos pelo conteúdo deste arquivo.</span>
            </label>
            <div className={styles.actions}>
              <Button variant="danger" icon="rotate" disabled={!understood || restoring} onClick={() => void restore()}>
                {restoring ? 'Restaurando…' : 'Restaurar este backup'}
              </Button>
              <Button variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            </div>
          </section>
        )}
      </div>
    </Card>
  );
}
