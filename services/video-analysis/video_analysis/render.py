"""Desenho das detecções sobre os quadros e gravação do vídeo anotado."""

from __future__ import annotations

from pathlib import Path
from types import TracebackType

import cv2
import numpy as np

from .errors import OutputError
from .types import BBox, TrackedDetection

# Cores BGR bem distintas; o número do rastreador escolhe a cor, então a mesma trilha mantém a mesma cor.
_PALETTE = [
    (255, 128, 0), (0, 200, 0), (0, 128, 255), (255, 0, 160), (0, 220, 220), (200, 80, 255),
    (80, 180, 255), (255, 200, 80), (120, 255, 120), (60, 60, 255), (200, 200, 0), (160, 120, 255),
]
_UNTRACKED = (170, 170, 170)
FOOTNOTE = "IDs do rastreador sao temporarios e NAO identificam atletas"


def track_color(track_id: int | None) -> tuple[int, int, int]:
    return _UNTRACKED if track_id is None else _PALETTE[track_id % len(_PALETTE)]


def draw_overlay(
    image_bgr: np.ndarray,
    detections: list[TrackedDetection],
    *,
    frame_index: int,
    timestamp_ms: float,
    banner: str | None = None,
) -> np.ndarray:
    """Devolve uma CÓPIA do quadro com caixas, identificadores temporários e confiança. `detections` já em pixels deste quadro."""
    canvas = image_bgr.copy()
    scale = min(0.7, max(0.28, canvas.shape[1] / 1400.0))  # texto proporcional à largura do quadro
    for item in detections:
        color = track_color(item.track_id)
        x1, y1, x2, y2 = (int(round(v)) for v in (item.bbox.x1, item.bbox.y1, item.bbox.x2, item.bbox.y2))
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)
        label = f"{'T' + str(item.track_id) if item.track_id is not None else '?'} {item.confidence:.2f}"
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
        top = max(0, y1 - th - baseline - 4)
        cv2.rectangle(canvas, (x1, top), (x1 + tw + 6, top + th + baseline + 4), color, -1)
        cv2.putText(canvas, label, (x1 + 3, top + th + 1), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 1, cv2.LINE_AA)
    height = canvas.shape[0]
    header = f"quadro {frame_index}  t={timestamp_ms / 1000.0:.2f}s  deteccoes={len(detections)}"
    cv2.putText(canvas, header, (8, int(30 * scale) + 4), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(canvas, header, (8, int(30 * scale) + 4), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(canvas, FOOTNOTE, (8, height - 8), cv2.FONT_HERSHEY_SIMPLEX, scale * 0.85, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(canvas, FOOTNOTE, (8, height - 8), cv2.FONT_HERSHEY_SIMPLEX, scale * 0.85, (255, 255, 255), 1, cv2.LINE_AA)
    if banner:
        cv2.putText(canvas, banner, (8, int(60 * scale) + 8), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(canvas, banner, (8, int(60 * scale) + 8), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 80, 255), 1, cv2.LINE_AA)
    return canvas


class AnnotatedVideoWriter:
    """Grava o vídeo anotado. Sempre libera o arquivo (use com `with`), mesmo se o processamento falhar no meio.

    O codec é `mp4v` (MPEG-4 parte 2): abre em VLC, Windows Media Player e no próprio OpenCV, mas navegadores podem não
    tocar. H.264 exigiria uma biblioteca externa que o OpenCV não traz.
    """

    def __init__(self, path: str | Path, fps: float, size: tuple[int, int]) -> None:
        self.path = Path(path)
        self.size = size  # (largura, altura)
        self.frames_written = 0
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._writer: cv2.VideoWriter | None = cv2.VideoWriter(str(self.path), cv2.VideoWriter_fourcc(*"mp4v"), float(fps), size)
        if not self._writer.isOpened():
            self._writer.release()
            self._writer = None
            raise OutputError(f"Não foi possível criar o vídeo de saída {self.path.name} (codec mp4v indisponível ou pasta sem permissão).")

    def write(self, frame_bgr: np.ndarray) -> None:
        if self._writer is None:
            raise OutputError("O vídeo anotado já foi encerrado.")
        if (frame_bgr.shape[1], frame_bgr.shape[0]) != self.size:
            raise OutputError(f"Quadro {frame_bgr.shape[1]}x{frame_bgr.shape[0]} diferente do tamanho do vídeo de saída {self.size[0]}x{self.size[1]}.")
        self._writer.write(frame_bgr)
        self.frames_written += 1

    def release(self) -> None:
        if self._writer is not None:
            self._writer.release()
            self._writer = None

    def __enter__(self) -> "AnnotatedVideoWriter":
        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None) -> None:
        self.release()


def interpolate_detections(previous: list[TrackedDetection], following: list[TrackedDetection] | None, alpha: float) -> list[TrackedDetection]:
    """Caixas para um quadro ENTRE dois quadros processados (`alpha` 0 = quadro anterior, 1 = o seguinte).

    Só serve para o vídeo anotado ficar fluido: nada disto vai para o JSON. Quem está nos dois quadros com o mesmo número de
    trilha tem a caixa interpolada em linha reta; quem só está num dos lados aparece até a metade do caminho; sem trilha
    (`None`) acompanha o lado mais próximo.
    """
    if following is None or alpha <= 0.0:
        return list(previous)
    if alpha >= 1.0:
        return list(following)
    later = {d.track_id: d for d in following if d.track_id is not None}
    result: list[TrackedDetection] = []
    for det in previous:
        if det.track_id is not None and det.track_id in later:
            b = later[det.track_id].bbox
            a = det.bbox
            mixed = BBox(a.x1 + (b.x1 - a.x1) * alpha, a.y1 + (b.y1 - a.y1) * alpha, a.x2 + (b.x2 - a.x2) * alpha, a.y2 + (b.y2 - a.y2) * alpha)
            result.append(TrackedDetection(det.track_id, mixed, det.confidence, det.label, det.in_roi))
        elif alpha < 0.5:
            result.append(det)
    previous_ids = {d.track_id for d in previous if d.track_id is not None}
    if alpha >= 0.5:
        result.extend(d for d in following if d.track_id is None or d.track_id not in previous_ids)
    return result
