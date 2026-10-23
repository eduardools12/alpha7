"""Apoio dos testes: vídeo SINTÉTICO (retângulos que se movem) e detectores de mentira.

Nada aqui é uma gravação real do Alpha7. Estes arquivos provam o FLUXO (leitura, tempos, rastreamento, saída), não a
qualidade da detecção de pessoas em vídeo de voleibol.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from video_analysis.detectors.base import DetectorInfo
from video_analysis.types import BBox, Detection

FPS = 10.0
SIZE = (320, 240)  # largura, altura


def truth_boxes(frame_index: int, people: int = 2) -> list[BBox]:
    """Caixas verdadeiras do quadro `frame_index`: pessoas "em pé" andando em linha reta, sem se cruzar."""
    boxes = []
    for k in range(people):
        x = 30 + k * 130 + (2.0 if k % 2 == 0 else -1.0) * frame_index
        boxes.append(BBox(x, 70.0, x + 40.0, 180.0))
    return boxes


def write_synthetic_video(path: Path, n_frames: int = 40, fps: float = FPS, size: tuple[int, int] = SIZE, people: int = 2, codec: str = "MJPG") -> Path:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*codec), fps, size)
    assert writer.isOpened(), "o ambiente de teste precisa conseguir gravar vídeo sintético"
    try:
        for i in range(n_frames):
            frame = np.full((size[1], size[0], 3), 60, dtype=np.uint8)
            cv2.putText(frame, str(i), (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            for box in truth_boxes(i, people):
                cv2.rectangle(frame, (int(box.x1), int(box.y1)), (int(box.x2), int(box.y2)), (40, 160, 230), -1)
            writer.write(frame)
    finally:
        writer.release()
    return path


class ScriptedDetector:
    """Devolve as caixas verdadeiras do quadro correspondente à chamada (chamada n = quadro n * stride).

    `fail_calls`: índices de chamada em que lança erro. `scale_to_image`: ajusta as caixas ao tamanho do quadro recebido
    (simula o detector trabalhando num quadro reduzido).
    """

    def __init__(self, stride: int = 1, people: int = 2, fail_calls: set[int] | None = None, always_fail: bool = False, scale_to_image: bool = False, confidence: float = 0.9) -> None:
        self.info = DetectorInfo("scripted", "test", "n/a", "n/a", "valor fixo de teste", "detector de mentira")
        self.stride, self.people, self.fail_calls = stride, people, fail_calls or set()
        self.always_fail, self.scale_to_image, self.confidence = always_fail, scale_to_image, confidence
        self.calls = 0
        self.closed = False

    def detect(self, image_bgr: np.ndarray) -> list[Detection]:
        call, self.calls = self.calls, self.calls + 1
        if self.always_fail or call in self.fail_calls:
            raise RuntimeError("falha simulada do detector")
        scale = image_bgr.shape[1] / SIZE[0] if self.scale_to_image else 1.0
        return [Detection(b.scaled(scale, scale), self.confidence) for b in truth_boxes(call * self.stride, self.people)]

    def close(self) -> None:
        self.closed = True
