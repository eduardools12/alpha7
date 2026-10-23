"""Compara configurações do rastreador sobre AS MESMAS detecções de um vídeo (o detector roda uma vez por taxa de quadros).

    python tools/compare_tracking.py --input video.mp4 --weights models/yolox_s.onnx --seconds 60 --out out/comparacao

IMPORTANTE: não há anotação manual de identidades, então não existe "taxa de acerto de IDs". As métricas abaixo são
INDICADORES (proxies): menos trilhas, trilhas mais longas e menos "recomeços suspeitos" para o mesmo número de pessoas
visíveis sugerem menos trocas, mas não provam. A conferência final é assistir ao vídeo anotado.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from video_analysis.detectors import create_detector  # noqa: E402
from video_analysis.tracking import PersonTracker  # noqa: E402
from video_analysis.types import BBox, Detection  # noqa: E402
from video_analysis.video_io import FrameReader, probe_video  # noqa: E402


def variants(fps: float) -> dict[str, PersonTracker]:
    """Parâmetros em SEGUNDOS convertidos para quadros processados, para que 5 e 10 quadros/s sejam comparáveis."""
    def frames(seconds: float) -> int:
        return max(1, round(seconds * fps))

    nascimento = dict(min_hits=max(3, frames(0.6)), tentative_max_misses=1, min_height_ratio=0.08, aspect_range=(1.0, 5.0))
    memoria = dict(max_age=frames(6.0), recover=True, recover_speed=0.6 * 5.0 / fps)
    return {
        "0 base (fase 1)": PersonTracker(min_hits=max(2, frames(0.4)), max_age=frames(3.0)),
        "1 + nascimento exigente": PersonTracker(max_age=frames(3.0), **nascimento),
        "2 + memória e recuperação": PersonTracker(**nascimento, **memoria),
        "3 + aparência (cor)": PersonTracker(**nascimento, **memoria, use_appearance=True),
    }


@dataclass
class Replay:
    tracks: dict[int, list[tuple[float, BBox]]]
    detections: int
    in_tracks: int
    frames: int


def collect_detections(video: Path, weights: Path, seconds: float, fps: float, cache: Path):
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    info = probe_video(video)
    stride = max(1, round(info.fps / fps))
    detector = create_detector("yolox-onnx", weights=weights, confidence=0.3)
    rows = []
    started = time.perf_counter()
    with FrameReader(video, info, stride=stride, max_seconds=seconds) as reader:
        for record in reader.frames():
            dets = detector.detect(record.image)
            rows.append({"i": record.index, "t": record.timestamp_ms, "d": [[*d.bbox.as_list(), round(d.confidence, 4)] for d in dets]})
    detector.close()
    data = {"fps": info.fps / stride, "stride": stride, "frames": rows, "detect_seconds": round(time.perf_counter() - started, 1)}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data), encoding="utf-8")
    return data


def replay(video: Path, data: dict, tracker: PersonTracker) -> tuple[Replay, float]:
    info = probe_video(video)
    tracks: dict[int, list[tuple[float, BBox]]] = {}
    detections = in_tracks = 0
    clock = time.perf_counter()
    rows = data["frames"]
    with FrameReader(video, info, stride=data["stride"], max_seconds=data["frames"][-1]["t"] / 1000.0 + 0.5) as reader:
        for record, row in zip(reader.frames(), rows):
            dets = [Detection(BBox(*d[:4]), d[4]) for d in row["d"]]
            for item in tracker.update(dets, record.image):
                detections += 1
                if item.track_id is not None:
                    in_tracks += 1
                    tracks.setdefault(item.track_id, []).append((row["t"] / 1000.0, item.bbox))
    return Replay(tracks, detections, in_tracks, len(rows)), time.perf_counter() - clock


def suspicious_restarts(tracks: dict[int, list[tuple[float, BBox]]], gap_s: float = 2.5, reach: float = 1.5) -> int:
    """Quantos nascimentos acontecem logo depois, e perto de onde, outra trilha acabou (provável mesma pessoa com número novo)."""
    ends = {tid: (pts[-1][0], pts[-1][1]) for tid, pts in tracks.items()}
    claimed: set[int] = set()
    count = 0
    for tid, pts in sorted(tracks.items(), key=lambda kv: kv[1][0][0]):
        start_t, start_box = pts[0]
        best = None
        for other, (end_t, end_box) in ends.items():
            if other == tid or other in claimed or not (0 < start_t - end_t <= gap_s):
                continue
            cx, cy = start_box.center
            ox, oy = end_box.center
            distance = ((cx - ox) ** 2 + (cy - oy) ** 2) ** 0.5 / max(start_box.height, end_box.height, 1.0)
            if distance <= reach and (best is None or distance < best[1]):
                best = (other, distance)
        if best:
            claimed.add(best[0])
            count += 1
    return count


def impossible_jumps(tracks: dict[int, list[tuple[float, BBox]]], max_heights_per_s: float = 4.0) -> int:
    """Saltos dentro de UMA trilha mais rápidos do que uma pessoa corre (~4 alturas de caixa por segundo, cerca de 7 m/s).
    Sinal de que a trilha juntou duas pessoas diferentes (fusão errada), o risco de reaproveitar trilhas perdidas."""
    count = 0
    for pts in tracks.values():
        for (t0, b0), (t1, b1) in zip(pts, pts[1:]):
            dt = t1 - t0
            if dt <= 0:
                continue
            (x0, y0), (x1, y1) = b0.center, b1.center
            distance = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 / max(b0.height, b1.height, 1.0)
            if distance / dt > max_heights_per_s:
                count += 1
    return count


def metrics(result: Replay, seconds: float) -> dict[str, object]:
    durations = [pts[-1][0] - pts[0][0] for pts in result.tracks.values()]
    alive = sum(len(pts) for pts in result.tracks.values()) / max(1, result.frames)
    return {
        "trilhas": len(result.tracks),
        "mediana_s": round(statistics.median(durations), 1) if durations else 0.0,
        "ge_10s": sum(d >= 10 for d in durations),
        "lt_2s": sum(d < 2 for d in durations),
        "recomecos_suspeitos": suspicious_restarts(result.tracks),
        "saltos_impossiveis": impossible_jumps(result.tracks),
        "deteccoes_em_trilha_pct": round(100.0 * result.in_tracks / max(1, result.detections), 1),
        "trilhas_ativas_por_quadro": round(alive, 2),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--weights", required=True, type=Path)
    parser.add_argument("--seconds", type=float, default=60.0)
    parser.add_argument("--fps", type=float, nargs="+", default=[5.0, 10.0])
    parser.add_argument("--out", type=Path, default=Path("out/comparacao"))
    args = parser.parse_args()

    report: dict[str, object] = {"video": args.input.name, "seconds": args.seconds, "resultados": {}}
    for fps in args.fps:
        data = collect_detections(args.input, args.weights, args.seconds, fps, args.out / f"deteccoes_{fps:g}fps.json")
        print(f"\n== {fps:g} quadros/s: {len(data['frames'])} quadros, detecção {data.get('detect_seconds', '?')} s (uma vez)")
        header = f"{'configuração':28} {'trilhas':>7} {'mediana':>8} {'>=10s':>6} {'<2s':>5} {'recomeços':>10} {'saltos':>7} {'det.em trilha':>14} {'ativas/quadro':>14} {'rastreio(s)':>12}"
        print(header)
        report["resultados"][f"{fps:g}fps"] = {}  # type: ignore[index]
        for name, tracker in variants(data["fps"]).items():
            result, seconds = replay(args.input, data, tracker)
            m = metrics(result, args.seconds)
            m["segundos_de_rastreio"] = round(seconds, 1)
            report["resultados"][f"{fps:g}fps"][name] = m  # type: ignore[index]
            print(f"{name:28} {m['trilhas']:>7} {m['mediana_s']:>7}s {m['ge_10s']:>6} {m['lt_2s']:>5} {m['recomecos_suspeitos']:>10} {m['saltos_impossiveis']:>7} {m['deteccoes_em_trilha_pct']:>13}% {m['trilhas_ativas_por_quadro']:>14} {m['segundos_de_rastreio']:>12}")
    (args.out / "comparacao.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
