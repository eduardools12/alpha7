"""Montagem, validação e gravação do JSON de resultado (esquema versionado)."""

from __future__ import annotations

import json
import os
import platform
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

from . import __version__
from .calibration import CourtCalibration
from .detectors.base import DetectorInfo
from .errors import OutputError
from .types import TrackedDetection
from .video_io import VideoInfo

SCHEMA_VERSION = "alpha7.video-analysis/1"

DISCLAIMERS = [
    "Os track_id são números TEMPORÁRIOS do rastreador e não identificam atletas. Podem trocar quando pessoas se cruzam, ficam ocultas ou saem do quadro.",
    "Este arquivo contém apenas detecções de pessoas e trajetórias observadas. Não há estatísticas de saque, recepção, levantamento ou ataque.",
    "Nenhum nome de atleta foi atribuído: tracks[].identity.athlete_id é sempre null até uma revisão humana confirmar.",
    "A confiança (confidence) depende do detector; veja processing.detector.confidence_semantics.",
]


@dataclass
class FrameResult:
    frame_index: int
    timestamp_ms: float
    timestamp_source: str
    detections: list[TrackedDetection]  # já em pixels do vídeo ORIGINAL
    detector_error: str | None = None


@dataclass
class RunStats:
    started_at: datetime
    finished_at: datetime
    processing_seconds: float
    detector_seconds: float
    status: str  # completed | completed_with_errors | aborted_detector_failure | ended_early
    decode_errors: list[dict[str, Any]] = field(default_factory=list)
    detector_errors: list[dict[str, Any]] = field(default_factory=list)
    timestamps_from_index: int = 0
    ended_early_at: int | None = None
    video_frames_written: int = 0


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


def _detection_dict(item: TrackedDetection, calibration: CourtCalibration | None) -> dict[str, Any]:
    ax, ay = item.bbox.anchor
    court_xy: list[float] | None = None
    inside: bool | None = None
    if calibration is not None:
        cx, cy = calibration.to_court(ax, ay)
        court_xy = [round(cx, 3), round(cy, 3)]
        inside = calibration.contains(cx, cy)
    return {
        "track_id": item.track_id,
        "label": item.label,
        "bbox_xyxy": item.bbox.as_list(),
        "confidence": round(item.confidence, 4),
        "anchor_xy": [round(ax, 2), round(ay, 2)],
        "court_xy_m": court_xy,
        "in_calibrated_area": inside,
        "in_roi": item.in_roi,
    }


def _build_tracks(frames: list[FrameResult], calibration: CourtCalibration | None) -> list[dict[str, Any]]:
    grouped: dict[int, list[tuple[FrameResult, TrackedDetection]]] = {}
    for frame in frames:
        for item in frame.detections:
            if item.track_id is not None:
                grouped.setdefault(item.track_id, []).append((frame, item))
    tracks: list[dict[str, Any]] = []
    for track_id in sorted(grouped):
        seen = grouped[track_id]
        path = []
        for frame, item in seen:
            ax, ay = item.bbox.anchor
            point: dict[str, Any] = {"frame_index": frame.frame_index, "timestamp_ms": round(frame.timestamp_ms, 1), "x": round(ax, 2), "y": round(ay, 2)}
            if calibration is not None:
                cx, cy = calibration.to_court(ax, ay)
                point["court_x_m"], point["court_y_m"] = round(cx, 3), round(cy, 3)
            path.append(point)
        tracks.append(
            {
                "track_id": track_id,
                "first_frame_index": seen[0][0].frame_index,
                "last_frame_index": seen[-1][0].frame_index,
                "first_timestamp_ms": round(seen[0][0].timestamp_ms, 1),
                "last_timestamp_ms": round(seen[-1][0].timestamp_ms, 1),
                "detections": len(seen),
                "mean_confidence": round(sum(i.confidence for _, i in seen) / len(seen), 4),
                # Preenchido numa revisão futura (humana). Nesta fase é sempre vazio.
                "identity": {"athlete_id": None, "status": "unassigned"},
                "path": path,
            }
        )
    return tracks


def build_result(
    *,
    info: VideoInfo,
    frames: list[FrameResult],
    detector: DetectorInfo,
    stats: RunStats,
    settings: dict[str, Any],
    calibration: CourtCalibration | None,
    source_sha256: str | None = None,
) -> dict[str, Any]:
    detections_total = sum(len(f.detections) for f in frames)
    tracked = sum(1 for f in frames for d in f.detections if d.track_id is not None)
    tracks = _build_tracks(frames, calibration)
    processed = [f for f in frames if f.detector_error is None]
    video_span_s = (frames[-1].timestamp_ms - frames[0].timestamp_ms) / 1000.0 if len(frames) > 1 else 0.0
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": _iso(stats.finished_at),
        "generator": {
            "name": "alpha7-video-analysis",
            "version": __version__,
            "python": platform.python_version(),
            "opencv": cv2.__version__,
            "platform": f"{platform.system()} {platform.machine()}",
        },
        "source": {
            "filename": info.filename,
            "size_bytes": info.size_bytes,
            "sha256": source_sha256,
            "width": info.width,
            "height": info.height,
            "fps": round(info.fps, 4),
            "frame_count": info.frame_count,
            "duration_s": round(info.duration_s, 3) if info.duration_s is not None else None,
            "fourcc": info.fourcc,
        },
        # Reservado para a revisão futura (relacionar este vídeo a uma partida do Alpha7). Nada é preenchido aqui.
        "link": {"match_id": None, "video_id": None, "notes": ""},
        "processing": {
            "started_at": _iso(stats.started_at),
            "finished_at": _iso(stats.finished_at),
            "settings": settings,
            "detector": {
                "name": detector.name,
                "version": detector.version,
                "code_license": detector.code_license,
                "weights_license": detector.weights_license,
                "confidence_semantics": detector.confidence_semantics,
                "notes": detector.notes,
            },
            "tracker": {"name": "alpha7-iou-tracker", "ids": "temporarios", "uses_appearance": False},
            "coordinates": "pixels do vídeo ORIGINAL; origem no canto superior esquerdo; x para a direita, y para baixo",
        },
        "calibration": ({"status": "calibrated", **calibration.to_dict()} if calibration else {"status": "not_calibrated"}),
        "disclaimers": DISCLAIMERS,
        "frames": [
            {
                "frame_index": f.frame_index,
                "timestamp_ms": round(f.timestamp_ms, 1),
                "timestamp_source": f.timestamp_source,
                "detector_error": f.detector_error,
                "detections": [_detection_dict(d, calibration) for d in f.detections],
            }
            for f in frames
        ],
        "tracks": tracks,
        "summary": {
            "status": stats.status,
            "frames_processed": len(processed),
            "frames_with_detector_error": len(frames) - len(processed),
            "video_span_s": round(video_span_s, 3),
            "detections_total": detections_total,
            "detections_in_tracks": tracked,
            "tracks_confirmed": len(tracks),
            "mean_detections_per_frame": round(detections_total / len(processed), 3) if processed else 0.0,
            "processing_seconds": round(stats.processing_seconds, 3),
            "detector_seconds": round(stats.detector_seconds, 3),
            "ms_per_processed_frame": round(1000.0 * stats.processing_seconds / len(processed), 1) if processed else None,
            "realtime_factor": round(video_span_s / stats.processing_seconds, 3) if stats.processing_seconds > 0 and video_span_s > 0 else None,
            "decode_errors": len(stats.decode_errors),
            "detector_errors": len(stats.detector_errors),
            "timestamps_from_frame_index": stats.timestamps_from_index,
            "ended_early_at_frame": stats.ended_early_at,
            "annotated_video_frames": stats.video_frames_written,
            "errors": {"decode": stats.decode_errors[:50], "detector": stats.detector_errors[:50]},
        },
    }


def validate_result(data: Any) -> list[str]:
    """Confere a estrutura do JSON. Devolve a lista de problemas (vazia = válido). Usada nos testes e na CLI."""
    problems: list[str] = []

    def need(container: Any, key: str, kind: type | tuple[type, ...], where: str) -> Any:
        if not isinstance(container, dict) or key not in container:
            problems.append(f"{where}: falta o campo '{key}'")
            return None
        value = container[key]
        if value is not None and not isinstance(value, kind):
            problems.append(f"{where}.{key}: tipo inesperado ({type(value).__name__})")
        return value

    if not isinstance(data, dict):
        return ["a raiz precisa ser um objeto"]
    if data.get("schema_version") != SCHEMA_VERSION:
        problems.append(f"schema_version precisa ser {SCHEMA_VERSION!r}")
    for key, kind in (("generator", dict), ("source", dict), ("link", dict), ("processing", dict), ("calibration", dict), ("disclaimers", list), ("frames", list), ("tracks", list), ("summary", dict)):
        need(data, key, kind, "raiz")
    source = data.get("source") if isinstance(data.get("source"), dict) else {}
    for key, kind in (("filename", str), ("width", int), ("height", int), ("fps", (int, float))):
        need(source, key, kind, "source")
    track_ids: set[int] = set()
    for t_index, track in enumerate(data.get("tracks") or []):
        where = f"tracks[{t_index}]"
        track_id = need(track, "track_id", int, where)
        if isinstance(track_id, int):
            track_ids.add(track_id)
        identity = need(track, "identity", dict, where)
        if isinstance(identity, dict) and identity.get("athlete_id") is not None:
            problems.append(f"{where}.identity.athlete_id deve ser null nesta fase")
        need(track, "path", list, where)
    previous_ts = -1.0
    for f_index, frame in enumerate(data.get("frames") or []):
        where = f"frames[{f_index}]"
        index = need(frame, "frame_index", int, where)
        ts = need(frame, "timestamp_ms", (int, float), where)
        if isinstance(ts, (int, float)):
            if ts < previous_ts:
                problems.append(f"{where}: timestamp_ms diminuiu")
            previous_ts = float(ts)
        if isinstance(index, int) and index < 0:
            problems.append(f"{where}: frame_index negativo")
        for d_index, det in enumerate((frame.get("detections") if isinstance(frame, dict) else None) or []):
            dwhere = f"{where}.detections[{d_index}]"
            box = need(det, "bbox_xyxy", list, dwhere)
            if isinstance(box, list) and (len(box) != 4 or not all(isinstance(v, (int, float)) for v in box)):
                problems.append(f"{dwhere}.bbox_xyxy precisa ter 4 números")
            conf = need(det, "confidence", (int, float), dwhere)
            if isinstance(conf, (int, float)) and not 0.0 <= conf <= 1.0:
                problems.append(f"{dwhere}.confidence fora de 0..1")
            tid = det.get("track_id") if isinstance(det, dict) else None
            if tid is not None and tid not in track_ids:
                problems.append(f"{dwhere}.track_id {tid} não existe em tracks")
    return problems


def write_json_atomic(data: dict[str, Any], path: str | Path) -> None:
    """Grava por arquivo temporário + troca, para nunca deixar um JSON pela metade."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(dir=target.parent, prefix=target.name + ".", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=1)
            stream.write("\n")
        os.replace(temp_name, target)
    except OSError as error:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise OutputError(f"Não foi possível gravar {target.name}: {error.strerror or error}") from error


def summary_text(data: dict[str, Any]) -> str:
    s, src = data["summary"], data["source"]
    lines = [
        f"Vídeo: {src['filename']} ({src['width']}x{src['height']}, {src['fps']} fps)",
        f"Situação: {s['status']}",
        f"Quadros processados: {s['frames_processed']}  (com falha do detector: {s['frames_with_detector_error']})",
        f"Detecções: {s['detections_total']}  em trilhas: {s['detections_in_tracks']}  trilhas confirmadas: {s['tracks_confirmed']}",
        f"Tempo de processamento: {s['processing_seconds']} s  ({s['ms_per_processed_frame']} ms por quadro processado; "
        f"{s['realtime_factor']}x o tempo real)",
        f"Erros: decodificação={s['decode_errors']}  detector={s['detector_errors']}",
        "IDs de trilha são temporários e não identificam atletas.",
    ]
    return "\n".join(lines)


__all__ = ["SCHEMA_VERSION", "FrameResult", "RunStats", "build_result", "validate_result", "write_json_atomic", "summary_text"]
