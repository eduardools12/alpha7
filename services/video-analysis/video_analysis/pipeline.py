"""Fluxo completo: ler quadros, detectar pessoas, rastrear, desenhar e exportar. Sem GUI e sem rede."""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import cv2

from .calibration import CourtCalibration, load_calibration
from .detectors import PersonDetector, create_detector
from .errors import OutputError
from .export import FrameResult, RunStats, build_result, validate_result, write_json_atomic
from .render import AnnotatedVideoWriter, draw_overlay, interpolate_detections
from .tracking import PersonTracker
import numpy as np
from .types import Detection, TrackedDetection
from .video_io import FrameReader, probe_video

# Falhas do detector seguidas a partir das quais o processamento para (e ainda exporta o que já tem).
MAX_CONSECUTIVE_DETECTOR_FAILURES = 10


@dataclass(frozen=True)
class AnalysisConfig:
    input_path: Path
    output_dir: Path
    detector: str = "hog"
    weights: Path | None = None
    #: Taxa de quadros a processar; o salto entre quadros sai de fps do vídeo / target_fps. Ignorado se `stride` for dado.
    target_fps: float | None = 5.0
    stride: int | None = None
    #: Largura máxima do quadro enviado ao detector (os resultados voltam para a resolução original). None = original.
    max_width: int | None = 960
    start_seconds: float = 0.0
    max_seconds: float | None = None
    confidence: float = 0.3
    write_video: bool = True
    calibration_path: Path | None = None
    hash_source: bool = False
    threads: int | None = None
    #: "improved" (padrão) ou "basic" (o da fase 1). Ver tracking.py.
    tracker: str = "improved"
    #: "source" (padrão): vídeo anotado na velocidade e fluidez do original, com caixas interpoladas entre os quadros processados;
    #: "processed": só os quadros processados (menos quadros por segundo, mais leve).
    annotated_fps: str = "source"
    #: Região de interesse: polígono em pixels do vídeo ORIGINAL. Quem tem os pés fora dele não ganha trilha (vira `in_roi: false`).
    roi_polygon: tuple[tuple[float, float], ...] | None = None

    def resolve_stride(self, fps: float) -> int:
        if self.stride is not None:
            if self.stride < 1:
                raise ValueError("--stride precisa ser maior ou igual a 1.")
            return self.stride
        if self.target_fps is None or self.target_fps <= 0:
            return 1
        return max(1, round(fps / self.target_fps))


@dataclass(frozen=True)
class Progress:
    frames_done: int
    frames_expected: int | None
    elapsed_seconds: float
    video_seconds: float


@dataclass
class AnalysisOutputs:
    json_path: Path
    summary_path: Path
    video_path: Path | None
    result: dict[str, Any] = field(repr=False, default_factory=dict)

    @property
    def status(self) -> str:
        return str(self.result["summary"]["status"])


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _resize_for_detector(image: Any, max_width: int | None) -> tuple[Any, float]:
    """Reduz o quadro (se preciso) e devolve também o fator para voltar às coordenadas originais."""
    height, width = image.shape[:2]
    if max_width is None or width <= max_width:
        return image, 1.0
    scale = max_width / width
    return cv2.resize(image, (max_width, max(1, int(round(height * scale)))), interpolation=cv2.INTER_AREA), 1.0 / scale


def _write_annotated_video(config: AnalysisConfig, info: Any, frames: list[FrameResult], stride: int, path: Path) -> int:
    """Segunda passagem: relê o vídeo e grava o anotado. Em modo `source` escreve TODOS os quadros do trecho analisado,
    com as caixas interpoladas entre os quadros processados; em `processed`, só os processados."""
    if config.annotated_fps not in ("source", "processed"):
        raise ValueError("annotated_fps precisa ser 'source' ou 'processed'.")
    smooth = config.annotated_fps == "source"
    first, last = frames[0].frame_index, frames[-1].frame_index
    by_index = {f.frame_index: f for f in frames}
    ordered = sorted(by_index)
    step = 1 if smooth else stride
    reader = FrameReader(config.input_path, info, stride=step, start_seconds=first / info.fps, max_seconds=(last - first + 1) / info.fps)
    writer: AnnotatedVideoWriter | None = None
    cursor = 0
    try:
        with reader:
            for record in reader.frames():
                index = record.index
                while cursor + 1 < len(ordered) and ordered[cursor + 1] <= index:
                    cursor += 1
                previous = by_index[ordered[cursor]]
                following = by_index[ordered[cursor + 1]] if cursor + 1 < len(ordered) else None
                small, to_original = _resize_for_detector(record.image, config.max_width)
                if smooth and following is not None and following.frame_index > previous.frame_index:
                    alpha = (index - previous.frame_index) / (following.frame_index - previous.frame_index)
                    dets = interpolate_detections(previous.detections, following.detections, alpha)
                else:
                    dets = previous.detections
                shown = [TrackedDetection(d.track_id, d.bbox.scaled(1.0 / to_original, 1.0 / to_original), d.confidence, d.label, d.in_roi) for d in dets]
                if writer is None:
                    height, width = small.shape[:2]
                    writer = AnnotatedVideoWriter(path, info.fps / step, (width, height))
                banner = "FALHA DO DETECTOR NESTE QUADRO" if previous.detector_error else None
                writer.write(draw_overlay(small, shown, frame_index=index, timestamp_ms=record.timestamp_ms, banner=banner))
    finally:
        written = writer.frames_written if writer else 0
        if writer is not None:
            writer.release()
    return written


def analyze_video(
    config: AnalysisConfig,
    *,
    detector: PersonDetector | None = None,
    tracker: PersonTracker | None = None,
    progress: Callable[[Progress], None] | None = None,
    progress_interval_s: float = 5.0,
) -> AnalysisOutputs:
    """Analisa um vídeo e grava `<nome>.analysis.json`, `<nome>.summary.json` e (opcional) `<nome>.annotated.mp4`.

    Falhas do detector num quadro não derrubam o processamento (viram `detector_error` no JSON); depois de
    `MAX_CONSECUTIVE_DETECTOR_FAILURES` seguidas ele para e exporta o que conseguiu. Problemas de entrada (arquivo
    inexistente, ilegível) lançam `VideoAnalysisError` antes de criar qualquer saída.
    """
    info = probe_video(config.input_path)  # lança VideoNotFoundError / VideoUnreadableError
    stride = config.resolve_stride(info.fps)
    calibration: CourtCalibration | None = (
        load_calibration(config.calibration_path, (info.width, info.height)) if config.calibration_path else None
    )
    owns_detector = detector is None
    active_detector = detector or create_detector(config.detector, weights=config.weights, confidence=config.confidence, threads=config.threads)
    if config.tracker not in ("basic", "improved"):
        raise ValueError("tracker precisa ser 'basic' ou 'improved'.")
    if config.roi_polygon is not None and len(config.roi_polygon) < 3:
        raise ValueError("A região de interesse (ROI) precisa de pelo menos 3 pontos.")
    roi = np.array(config.roi_polygon, dtype=np.float32).reshape(-1, 1, 2) if config.roi_polygon else None
    active_tracker = tracker or (PersonTracker.improved() if config.tracker == "improved" else PersonTracker.basic())

    stem = Path(info.filename).stem
    out_dir = Path(config.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"{stem}.analysis.json"
    summary_path = out_dir / f"{stem}.summary.json"
    video_path = out_dir / f"{stem}.annotated.mp4" if config.write_video else None

    frames: list[FrameResult] = []
    detector_errors: list[dict[str, Any]] = []
    detector_seconds = 0.0
    consecutive_failures = 0
    aborted = False
    started_at = datetime.now(timezone.utc)
    clock = time.perf_counter()
    last_report = clock
    reader = FrameReader(config.input_path, info, stride=stride, start_seconds=config.start_seconds, max_seconds=config.max_seconds)
    expected = None
    if reader.last_index_exclusive is not None:
        expected = max(0, -(-(reader.last_index_exclusive - reader.first_index) // stride))

    try:
        with reader:
            for record in reader.frames():
                small, to_original = _resize_for_detector(record.image, config.max_width)
                detections: list[Detection] = []
                error_text: str | None = None
                tick = time.perf_counter()
                try:
                    detections = active_detector.detect(small)
                    consecutive_failures = 0
                except Exception as error:  # qualquer falha do detector é isolada no quadro
                    error_text = f"{type(error).__name__}: {error}"
                    detector_errors.append({"frame_index": record.index, "message": error_text})
                    consecutive_failures += 1
                detector_seconds += time.perf_counter() - tick

                tracked_small: list[TrackedDetection] = []
                if error_text is None:
                    inside = [True] * len(detections)
                    if roi is not None:
                        for k, det in enumerate(detections):
                            ax, ay = det.bbox.scaled(to_original, to_original).anchor
                            inside[k] = cv2.pointPolygonTest(roi, (float(ax), float(ay)), False) >= 0
                    candidates = [d for d, ok in zip(detections, inside) if ok]
                    tracked_inside = iter(active_tracker.update(candidates, small))
                    for det, ok in zip(detections, inside):
                        item = next(tracked_inside) if ok else TrackedDetection(None, det.bbox, det.confidence, det.label)
                        tracked_small.append(TrackedDetection(item.track_id, item.bbox, item.confidence, item.label, in_roi=ok if roi is not None else None))
                tracked_original = [
                    TrackedDetection(t.track_id, t.bbox.scaled(to_original, to_original).clipped(info.width, info.height), t.confidence, t.label, t.in_roi)
                    for t in tracked_small
                ]
                frames.append(FrameResult(record.index, record.timestamp_ms, record.timestamp_source, tracked_original, error_text))

                now = time.perf_counter()
                if progress and now - last_report >= progress_interval_s:
                    last_report = now
                    progress(Progress(len(frames), expected, now - clock, (record.timestamp_ms - frames[0].timestamp_ms) / 1000.0))
                if consecutive_failures >= MAX_CONSECUTIVE_DETECTOR_FAILURES:
                    aborted = True
                    break
    finally:
        if owns_detector:
            active_detector.close()

    processing_seconds = time.perf_counter() - clock
    video_frames = 0
    if video_path is not None and frames:
        video_frames = _write_annotated_video(config, info, frames, stride, video_path)
    if aborted:
        status = "aborted_detector_failure"
    elif reader.ended_early_at is not None:
        status = "ended_early"
    elif reader.errors or detector_errors:
        status = "completed_with_errors"
    else:
        status = "completed"
    stats = RunStats(
        started_at=started_at,
        finished_at=datetime.now(timezone.utc),
        processing_seconds=processing_seconds,
        detector_seconds=detector_seconds,
        status=status,
        decode_errors=[{"frame_index": e.frame_index, "message": e.message} for e in reader.errors],
        detector_errors=detector_errors,
        timestamps_from_index=reader.timestamps_from_index,
        ended_early_at=reader.ended_early_at,
        video_frames_written=video_frames,
    )
    settings = {
        "stride": stride,
        "effective_fps": round(info.fps / stride, 3),
        "max_width": config.max_width,
        "start_seconds": config.start_seconds,
        "max_seconds": config.max_seconds,
        "confidence_threshold": config.confidence,
        "write_video": config.write_video,
        "tracker": config.tracker,
        "annotated_fps": config.annotated_fps if config.write_video else None,
        "roi_polygon": [list(p) for p in config.roi_polygon] if config.roi_polygon else None,
    }
    result = build_result(
        info=info,
        frames=frames,
        detector=active_detector.info,
        stats=stats,
        settings=settings,
        calibration=calibration,
        source_sha256=_sha256(Path(config.input_path)) if config.hash_source else None,
    )
    problems = validate_result(result)
    if problems:  # defesa: nunca gravar um JSON que o próprio validador recusa
        raise OutputError("O resultado gerado é inválido: " + "; ".join(problems[:5]))
    write_json_atomic(result, json_path)
    write_json_atomic({"schema_version": result["schema_version"], "source": result["source"]["filename"], **result["summary"]}, summary_path)
    return AnalysisOutputs(json_path, summary_path, video_path if video_frames else None, result)

