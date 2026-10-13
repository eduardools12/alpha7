import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { PlayerPhoto } from '@/components/brand/PlayerPhoto';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { PHOTO_MAX_ZOOM, PHOTO_TYPES, validatePhotoFile } from '@/domain/photo';
import type { Player } from '@/domain/player';
import { canvasProcessor, type LoadedPhoto, type PhotoProcessor } from './photoCanvas';
import styles from './PhotoEditor.module.css';

const PREVIEW = { width: 240, height: 300 } as const;

interface Props {
  player: Player;
  /** Processamento em canvas; os testes passam uma versão simulada (o jsdom não desenha imagens). */
  processor?: PhotoProcessor;
}

/**
 * Foto do atleta (só comissão técnica): escolher, VER O RECORTE antes de salvar, substituir e remover. Valida o
 * formato e o tamanho do arquivo, mantém sempre a proporção 4:5 e guarda uma versão reduzida em JPEG.
 */
export function PhotoEditor({ player, processor = canvasProcessor }: Props) {
  const { actions } = useWorkspace();
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [zoom, setZoom] = useState(1);
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.3);
  const [busy, setBusy] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (photo && canvas.current) processor.preview(photo, canvas.current, zoom, focusX, focusY);
  }, [photo, zoom, focusX, focusY, processor]);

  useEffect(() => () => photo?.release(), [photo]);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    const problem = validatePhotoFile(file);
    if (problem) return setMessage({ tone: 'error', text: problem });
    try {
      const loaded = await processor.load(file);
      setZoom(1);
      setFocusX(0.5);
      setFocusY(0.3);
      setPhoto(loaded);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível abrir esta imagem.' });
    }
  };

  const save = async () => {
    if (!photo) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await processor.render(photo, zoom, focusX, focusY);
      await actions.setPlayerPhoto(player.id, blob);
      setPhoto(null);
      setMessage({ tone: 'success', text: player.photo ? 'Foto substituída.' : 'Foto salva.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar a foto.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await actions.setPlayerPhoto(player.id, null);
      setConfirmingRemoval(false);
      setMessage({ tone: 'success', text: 'Foto removida. A carta volta a mostrar a camisa.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível remover a foto.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.editor}>
      {message && (
        <Notice tone={message.tone} title={message.tone === 'success' ? 'Pronto' : 'Não foi possível concluir'}>
          {message.text}
        </Notice>
      )}

      {!photo && (
        <div className={styles.current}>
          <div className={styles.frame}>
            {player.photo ? <PlayerPhoto player={player} /> : <span className={styles.empty}>Sem foto</span>}
          </div>
          <div className={styles.actions}>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept={PHOTO_TYPES.join(',')}
              aria-label="Escolher arquivo da foto"
              tabIndex={-1}
              onChange={(event) => void choose(event)}
            />
            <Button variant="primary" icon="plus" disabled={busy} onClick={() => input.current?.click()}>
              {player.photo ? 'Substituir foto' : 'Escolher foto'}
            </Button>
            {player.photo && !confirmingRemoval && (
              <Button variant="danger" icon="trash" disabled={busy} onClick={() => setConfirmingRemoval(true)}>
                Remover foto
              </Button>
            )}
            <p className={styles.hint}>JPEG, PNG ou WebP. A foto fica em proporção 4:5 e é reduzida para ocupar pouco espaço.</p>
          </div>
        </div>
      )}

      {confirmingRemoval && !photo && (
        <Notice tone="warning" title={`Remover a foto de ${player.name}?`}>
          A foto sai da carta, do perfil, da escalação e das artes (que voltam a mostrar a camisa). O cadastro e as notas não mudam.
          <div className={styles.actions}>
            <Button variant="danger" icon="trash" disabled={busy} onClick={() => void remove()}>
              Confirmar remoção
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingRemoval(false)}>
              Cancelar
            </Button>
          </div>
        </Notice>
      )}

      {photo && (
        <div className={styles.crop}>
          <div className={styles.frame}>
            <canvas ref={canvas} width={PREVIEW.width} height={PREVIEW.height} className={styles.canvas} role="img" aria-label="Prévia do recorte da foto (proporção 4:5)" />
          </div>
          <div className={styles.controls}>
            <p className={styles.hint}>Ajuste o recorte. É assim que a foto aparece na carta, no perfil e na arte.</p>
            <label className={styles.slider}>
              <span>Zoom</span>
              <input type="range" min={1} max={PHOTO_MAX_ZOOM} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <label className={styles.slider}>
              <span>Posição horizontal</span>
              <input type="range" min={0} max={100} step={1} value={Math.round(focusX * 100)} onChange={(event) => setFocusX(Number(event.target.value) / 100)} />
            </label>
            <label className={styles.slider}>
              <span>Posição vertical</span>
              <input type="range" min={0} max={100} step={1} value={Math.round(focusY * 100)} onChange={(event) => setFocusY(Number(event.target.value) / 100)} />
            </label>
            <div className={styles.actions}>
              <Button variant="primary" icon="save" disabled={busy} onClick={() => void save()}>
                {busy ? 'Salvando…' : 'Salvar foto'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setPhoto(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
