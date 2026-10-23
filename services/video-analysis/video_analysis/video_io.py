"""Leitura e validação de vídeo (OpenCV). Streaming: nunca carrega o vídeo inteiro na memória."""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType
from typing import Iterator

import cv2
import numpy as np

from .errors import VideoNotFoundError, VideoUnreadableError

# Falhas de decodificação seguidas a partir das quais a leitura desiste (vídeo truncado ou corrompido).
MAX_CONSECUTIVE_DECODE_ERRORS = 30


@dataclass(frozen=True)
class VideoInfo:
    """Metadados lidos do arquivo. `frame_count` e `duration_s` podem ser None quando o contêiner não informa."""

    filename: str
    size_bytes: int
    width: int
    height: int
    fps: float
    frame_count: int | None
    duration_s: float | None
    fourcc: str


@dataclass(frozen=True)
class FrameRecord:
    """Um quadro lido. `timestamp_ms` é o instante do vídeo original (não do processamento)."""

    index: int
    timestamp_ms: float
    timestamp_source: str  # "container" (relógio do arquivo) ou "frame_index" (índice / fps)
    image: np.ndarray


@dataclass
class DecodeError:
    frame_index: int
    message: str


def _check_file(path: Path) -> None:
    if not path.exists():
        raise VideoNotFoundError(f"O arquivo de vídeo não existe: {path}. Confira o caminho informado em --input.")
    if not path.is_file():
        raise VideoNotFoundError(f"O caminho não é um arquivo de vídeo: {path}.")
    try:
        with open(path, "rb") as handle:
            if not handle.read(1):
                raise VideoUnreadableError(f"O arquivo está vazio: {path.name}.")
    except OSError as error:
        raise VideoUnreadableError(f"Não foi possível ler o arquivo {path.name}: {error.strerror or error}.") from error


def _fourcc_text(code: float) -> str:
    value = int(code)
    if value <= 0:
        return ""
    text = "".join(chr((value >> (8 * i)) & 0xFF) for i in range(4))
    return text if text.isprintable() else ""


def probe_video(path: str | os.PathLike[str]) -> VideoInfo:
    """Valida o arquivo, lê resolução, taxa de quadros e duração, e confere que o primeiro quadro decodifica."""
    video_path = Path(path)
    _check_file(video_path)
    capture = cv2.VideoCapture(str(video_path))
    try:
        if not capture.isOpened():
            raise VideoUnreadableError(
                f"O OpenCV não conseguiu abrir {video_path.name}. O arquivo pode estar corrompido, incompleto ou usar um codec sem suporte."
            )
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        raw_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        ok, first = capture.read()
        if not ok or first is None:
            raise VideoUnreadableError(f"{video_path.name} abre, mas o primeiro quadro não pôde ser decodificado (arquivo corrompido ou codec sem suporte).")
        # Algumas gravações não informam largura/altura nas propriedades: o primeiro quadro é a fonte confiável.
        if width <= 0 or height <= 0:
            height, width = int(first.shape[0]), int(first.shape[1])
        if not math.isfinite(fps) or fps <= 0:
            raise VideoUnreadableError(f"{video_path.name} não informa a taxa de quadros (fps), então os tempos não podem ser preservados.")
        frame_count = int(raw_count) if math.isfinite(raw_count) and raw_count > 0 else None
        duration = frame_count / fps if frame_count else None
        return VideoInfo(
            filename=video_path.name,
            size_bytes=video_path.stat().st_size,
            width=width,
            height=height,
            fps=fps,
            frame_count=frame_count,
            duration_s=duration,
            fourcc=_fourcc_text(capture.get(cv2.CAP_PROP_FOURCC)),
        )
    finally:
        capture.release()


@dataclass
class FrameReader:
    """Lê quadros em sequência, pulando de `stride` em `stride`, com liberação garantida do arquivo.

    Uso: `with FrameReader(path, info, stride=3) as reader: for frame in reader.frames(): ...`
    """

    path: Path
    info: VideoInfo
    stride: int = 1
    start_seconds: float = 0.0
    max_seconds: float | None = None
    errors: list[DecodeError] = field(default_factory=list)
    timestamps_from_index: int = 0
    #: Índice em que a leitura parou antes do fim anunciado (arquivo truncado ou contagem de quadros otimista).
    ended_early_at: int | None = None
    _capture: cv2.VideoCapture | None = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self.path = Path(self.path)
        if self.stride < 1:
            raise ValueError("stride deve ser um inteiro maior ou igual a 1.")
        if self.start_seconds < 0:
            raise ValueError("start_seconds não pode ser negativo.")

    def __enter__(self) -> "FrameReader":
        capture = cv2.VideoCapture(str(self.path))
        if not capture.isOpened():
            capture.release()
            raise VideoUnreadableError(f"O OpenCV não conseguiu abrir {self.path.name}.")
        self._capture = capture
        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None) -> None:
        self.close()

    def close(self) -> None:
        if self._capture is not None:
            self._capture.release()
            self._capture = None

    @property
    def first_index(self) -> int:
        return int(round(self.start_seconds * self.info.fps))

    @property
    def last_index_exclusive(self) -> int | None:
        """Primeiro índice que NÃO será processado (por --max-seconds ou pelo fim do arquivo); None se desconhecido."""
        limits: list[int] = []
        if self.max_seconds is not None:
            limits.append(self.first_index + int(round(self.max_seconds * self.info.fps)))
        if self.info.frame_count is not None:
            limits.append(self.info.frame_count)
        return min(limits) if limits else None

    def _timestamp(self, capture: cv2.VideoCapture, index: int) -> tuple[float, str]:
        by_index = index / self.info.fps * 1000.0
        container = float(capture.get(cv2.CAP_PROP_POS_MSEC))
        tolerance = 2.0 * 1000.0 / self.info.fps
        # O relógio do contêiner vale se for plausível; senão, cai para índice / fps e isso é contado no resumo.
        if math.isfinite(container) and container > 0 and abs(container - by_index) <= tolerance:
            return container, "container"
        self.timestamps_from_index += 1
        return by_index, "frame_index"

    def frames(self) -> Iterator[FrameRecord]:
        capture = self._capture
        if capture is None:
            raise RuntimeError("FrameReader precisa ser usado dentro de um bloco `with`.")
        index = self.first_index
        if index > 0 and not capture.set(cv2.CAP_PROP_POS_FRAMES, index):
            raise VideoUnreadableError(f"Não foi possível pular para {self.start_seconds:.1f}s em {self.path.name}.")
        end = self.last_index_exclusive
        pending: list[DecodeError] = []  # falhas seguidas só viram "erros" se depois houver quadro bom
        while end is None or index < end:
            wanted = (index - self.first_index) % self.stride == 0
            if wanted:
                ok, image = capture.read()
            else:
                ok, image = capture.grab(), None  # pular sem decodificar é bem mais barato
            if not ok:
                if self.info.frame_count is None:
                    break  # sem contagem no arquivo, falha de leitura é tratada como fim do vídeo
                pending.append(DecodeError(index, "quadro não pôde ser decodificado"))
                if len(pending) >= MAX_CONSECUTIVE_DECODE_ERRORS:
                    self.ended_early_at = pending[0].frame_index
                    return
                index += 1
                continue
            self.errors.extend(pending)
            pending = []
            if wanted:
                if image is None or image.size == 0:
                    self.errors.append(DecodeError(index, "quadro vazio"))
                else:
                    timestamp, source = self._timestamp(capture, index)
                    yield FrameRecord(index=index, timestamp_ms=timestamp, timestamp_source=source, image=image)
            index += 1
        if pending and end is not None:
            # Acabou o arquivo com falhas no final: trata como fim antecipado, não como erro de decodificação isolado.
            self.ended_early_at = pending[0].frame_index
