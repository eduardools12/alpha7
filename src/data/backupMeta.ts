/**
 * Lembrete do último backup EXPORTADO. Fica fora do workspace de propósito: não faz parte do backup
 * e não é restaurado por ele (descreve o que aconteceu neste navegador). Falhas de armazenamento
 * são ignoradas: o lembrete é só um conforto, nunca pode quebrar o aplicativo.
 */
export const LAST_BACKUP_KEY = 'alpha7.lastBackup.v1';
const KEY = LAST_BACKUP_KEY;

export interface LastBackup {
  /** Quando o arquivo foi exportado (ISO). */
  at: string;
  /** Impressão digital do workspace exportado: diz se algo mudou desde então. */
  fingerprint: string;
  filename: string;
}

export function readLastBackup(): LastBackup | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as LastBackup).at === 'string' &&
      typeof (data as LastBackup).fingerprint === 'string' &&
      typeof (data as LastBackup).filename === 'string'
    ) {
      const { at, fingerprint, filename } = data as LastBackup;
      return { at, fingerprint, filename };
    }
  } catch {
    /* ilegível ou sem acesso */
  }
  return null;
}

export function writeLastBackup(meta: LastBackup): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* sem espaço ou bloqueado: o backup já foi baixado, só perdemos o lembrete */
  }
}
