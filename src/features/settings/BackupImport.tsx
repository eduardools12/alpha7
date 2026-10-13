import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { MAX_BACKUP_BYTES, parseBackup, type ParseBackupResult, type WorkspaceSummary } from '@/data/backup';
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

const ROWS: { label: string; pick: (s: WorkspaceSummary) => number }[] = [
  { label: 'Atletas', pick: (s) => s.players },
  { label: 'Avaliações', pick: (s) => s.evaluations },
  { label: 'Escalações', pick: (s) => s.lineups },
  { label: 'Treinos', pick: (s) => s.trainings },
  { label: 'Exercícios', pick: (s) => s.exercises },
  { label: 'Registros de treino válidos', pick: (s) => s.trainingEvents },
  { label: 'Registros de treino desfeitos', pick: (s) => s.trainingEventsVoided },
];

/**
 * `replace`: já existe um workspace, que será substituído (mostra o atual, recomenda backup, exige "Entendi").
 * `startup`: não há workspace utilizável (primeiro acesso ou recuperação); só confirma a restauração.
 */
type BackupImportProps = { mode: 'replace'; current: WorkspaceSummary } | { mode: 'startup' };

/**
 * Escolher um arquivo de backup, ver a prévia e restaurar. Nada é alterado até a confirmação, e um
 * arquivo inválido é rejeitado por inteiro. Compartilhado entre Configurações e as telas de início/recuperação.
 */
export function BackupImport(props: BackupImportProps) {
  const current = props.mode === 'replace' ? props.current : null;
  const { actions } = useWorkspace();
  const status = useBackupStatus();
  const exporter = useBackupExport();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [understood, setUnderstood] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [inputKey, setInputKey] = useState(0); // recria o campo de arquivo para poder escolher o mesmo arquivo de novo
  const replacing = props.mode === 'replace';
  // Nível de título coerente com a página: dentro de Configurações o bloco já está sob um h3.
  const PreviewHeading = replacing ? 'h4' : 'h3';

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
        text: replacing
          ? `Backup restaurado: ${describeSummary(phase.parsed.summary)}. O conteúdo anterior ficou guardado como cópia de segurança: use "Desfazer última substituição" em Dados e armazenamento se precisar voltar.`
          : `Backup restaurado: ${describeSummary(phase.parsed.summary)}.`,
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

  return (
    <>
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
          <PreviewHeading className={styles.previewTitle}>Prévia: {phase.fileName}</PreviewHeading>
          <p className={styles.muted}>
            Exportado em {formatInstant(phase.parsed.meta.exportedAt)} pelo Alpha7 {phase.parsed.meta.appVersion} (formato v
            {phase.parsed.meta.formatVersion}). Arquivo íntegro e consistente.
          </p>
          <table className={styles.table}>
            <caption className="sr-only">{replacing ? 'Conteúdo do backup comparado com o workspace atual' : 'Conteúdo do backup'}</caption>
            <thead>
              <tr>
                <th scope="col">Conteúdo</th>
                <th scope="col">Backup</th>
                {replacing && <th scope="col">Atual</th>}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="tabular">{row.pick(phase.parsed.summary)}</td>
                  {current && <td className="tabular">{row.pick(current)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.muted}>O backup tem {describeOrigin(phase.parsed.summary)}.</p>
          {phase.parsed.warnings.length > 0 && (
            <Notice tone="info" title="Avisos">
              <ul className={styles.problems}>
                {phase.parsed.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Notice>
          )}
          {replacing ? (
            <>
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
            </>
          ) : (
            <Notice tone="info" title="O workspace será criado a partir deste arquivo">
              O arquivo não é alterado. Se algo falhar durante a restauração, nada é gravado.
            </Notice>
          )}
          <div className={styles.actions}>
            <Button variant={replacing ? 'danger' : 'primary'} icon="rotate" disabled={(replacing && !understood) || restoring} onClick={() => void restore()}>
              {restoring ? 'Restaurando…' : 'Restaurar este backup'}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
