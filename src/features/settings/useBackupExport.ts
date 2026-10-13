import { useState } from 'react';
import { BackupBlockedError, useWorkspace } from '@/data/WorkspaceProvider';
import { downloadTextFile } from '@/data/download';

export interface ExportMessage {
  tone: 'success' | 'error';
  text: string;
  /** Problemas encontrados (quando o backup foi recusado por inconsistência). */
  problems?: string[];
  /** Oferece baixar a cópia bruta como último recurso. */
  offerRaw?: boolean;
}

/**
 * Exportar o backup do workspace inteiro. A exportação só acontece por clique explícito e tem
 * mensagem de sucesso ou erro. Compartilhado entre o painel de backup e as confirmações de substituição.
 */
export function useBackupExport() {
  const { actions } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ExportMessage | null>(null);

  const exportNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { json, filename, summary } = await actions.exportBackup();
      downloadTextFile(filename, json);
      setMessage({
        tone: 'success',
        text: `Backup exportado: ${filename} (${summary.players} atletas, ${summary.evaluations} avaliações, ${summary.trainings} treinos, ${summary.trainingEvents} registros de treino, ${summary.lineups} escalações). Guarde o arquivo em local seguro: ele contém os dados da equipe sem criptografia.`,
      });
    } catch (error) {
      if (error instanceof BackupBlockedError) {
        setMessage({
          tone: 'error',
          text: `${error.message} (${error.totalProblems} ${error.totalProblems === 1 ? 'problema' : 'problemas'}). Um backup inconsistente daria falsa segurança.`,
          problems: error.problems,
          offerRaw: true,
        });
      } else {
        setMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Não foi possível exportar o backup.',
          offerRaw: true,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const downloadRaw = async () => {
    try {
      const raw = await actions.readRawData();
      if (raw === null) {
        setMessage({ tone: 'error', text: 'Não há dados salvos para baixar.' });
        return;
      }
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      downloadTextFile(`alpha7-dados-brutos-${stamp}.txt`, raw, 'text/plain');
      setMessage({ tone: 'success', text: 'Cópia bruta dos dados baixada. Ela não é um backup restaurável pelo aplicativo, mas preserva o conteúdo para recuperação manual.' });
    } catch {
      setMessage({ tone: 'error', text: 'Não foi possível ler os dados para baixar a cópia bruta.' });
    }
  };

  return { busy, message, exportNow, downloadRaw, clearMessage: () => setMessage(null) };
}
