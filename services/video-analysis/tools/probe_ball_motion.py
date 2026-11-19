"""TESTE DE VIABILIDADE (descartável) do caminho 2: bola por MOVIMENTO, com câmera fixa.

Ideia: diferença entre quadros -> manchas pequenas e arredondadas -> ligação entre quadros por trajetória (velocidade
constante) -> só ficam trilhas que se comportam como bola (andam de forma suave e rápida o bastante).

NÃO há anotação da posição da bola: o resultado é contagem de trilhas + conferência visual + UMA verificação manual
pontual (a bola vista a olho em torno de 20 s). Nunca uma taxa de acerto.

    python tools/probe_ball_motion.py --input video.mp4 --seconds 30 --out out/bola_movimento
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from video_analysis.video_io import FrameReader, probe_video  # noqa: E402


@dataclass
class Blob:
    x: float
    y: float
    area: float
    w: int
    h: int


@dataclass
class Track:
    points: list[tuple[int, float, float]] = field(default_factory=list)  # (quadro, x, y)
    missed: int = 0

    @property
    def last(self) -> tuple[int, float, float]:
        return self.points[-1]

    def velocity(self) -> tuple[float, float]:
        if len(self.points) < 2:
            return 0.0, 0.0
        (f0, x0, y0), (f1, x1, y1) = self.points[-2], self.points[-1]
        n = max(1, f1 - f0)
        return (x1 - x0) / n, (y1 - y0) / n

    def predicted(self, frame: int) -> tuple[float, float]:
        f, x, y = self.last
        vx, vy = self.velocity()
        return x + vx * (frame - f), y + vy * (frame - f)


def find_blobs(prev: np.ndarray, cur: np.ndarray, threshold: int, min_area: int, max_area: int, max_side: int) -> list[Blob]:
    diff = cv2.absdiff(cur, prev)
    _, mask = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    count, _, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    blobs = []
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        if not (min_area <= area <= max_area) or max(w, h) > max_side:
            continue
        if max(w, h) / max(1, min(w, h)) > 2.5 or area / float(w * h) < 0.4:
            continue  # compridas demais (pernas, braços, reflexos esticados) ou vazadas
        blobs.append(Blob(float(centroids[i][0]), float(centroids[i][1]), float(area), int(w), int(h)))
    return blobs


def link(tracks: list[Track], blobs: list[Blob], frame: int, gate: float, max_missed: int) -> tuple[list[Track], list[Track]]:
    done: list[Track] = []
    if tracks and blobs:
        cost = np.full((len(tracks), len(blobs)), 1e6)
        for i, t in enumerate(tracks):
            px, py = t.predicted(frame)
            for j, b in enumerate(blobs):
                d = ((b.x - px) ** 2 + (b.y - py) ** 2) ** 0.5
                if d <= gate:
                    cost[i, j] = d
        rows, cols = linear_sum_assignment(cost)
        used_t, used_b = set(), set()
        for r, c in zip(rows, cols):
            if cost[r, c] < 1e6:
                tracks[r].points.append((frame, blobs[c].x, blobs[c].y))
                tracks[r].missed = 0
                used_t.add(r)
                used_b.add(c)
        for i, t in enumerate(tracks):
            if i not in used_t:
                t.missed += 1
        new = [Track([(frame, b.x, b.y)]) for j, b in enumerate(blobs) if j not in used_b]
    else:
        for t in tracks:
            t.missed += 1
        new = [Track([(frame, b.x, b.y)]) for b in blobs]
    alive = []
    for t in tracks:
        (done if t.missed > max_missed else alive).append(t)
    return alive + new, done


def ball_like(track: Track, min_hits: int, min_speed: float, max_speed: float) -> bool:
    """Trilha "de bola": vários quadros, anda de forma suave e com velocidade de bola (nem parada, nem teletransporte)."""
    pts = track.points
    if len(pts) < min_hits:
        return False
    steps = [((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 / max(1, f1 - f0) for (f0, x0, y0), (f1, x1, y1) in zip(pts, pts[1:])]
    mean_speed = float(np.mean(steps))
    if not (min_speed <= mean_speed <= max_speed):
        return False
    # suavidade: a trajetória cabe numa parábola (x linear no tempo, y quadrático) com pouco resíduo
    f = np.array([p[0] for p in pts], dtype=float)
    f -= f[0]
    x = np.array([p[1] for p in pts])
    y = np.array([p[2] for p in pts])
    rx = np.std(x - np.polyval(np.polyfit(f, x, 1), f))
    ry = np.std(y - np.polyval(np.polyfit(f, y, 2 if len(pts) >= 5 else 1), f))
    return bool(rx < 4.0 and ry < 4.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--seconds", type=float, default=30.0)
    ap.add_argument("--threshold", type=int, default=22)
    ap.add_argument("--out", type=Path, default=Path("out/bola_movimento"))
    ap.add_argument("--check-time", type=float, default=20.0, help="instante em que a bola foi vista a olho")
    ap.add_argument("--check-xy", type=float, nargs=2, default=[762.0, 237.0], help="onde (px) a bola foi vista a olho")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    info = probe_video(args.input)

    prev = None
    active: list[Track] = []
    finished: list[Track] = []
    per_frame = []
    frames_cache: dict[int, np.ndarray] = {}
    with FrameReader(args.input, info, stride=1, max_seconds=args.seconds) as reader:
        for record in reader.frames():
            gray = cv2.GaussianBlur(cv2.cvtColor(record.image, cv2.COLOR_BGR2GRAY), (3, 3), 0)
            if prev is not None:
                blobs = find_blobs(prev, gray, args.threshold, min_area=8, max_area=260, max_side=26)
                per_frame.append(len(blobs))
                active, done = link(active, blobs, record.index, gate=45.0, max_missed=3)
                finished.extend(done)
            if record.index % 30 == 0:
                frames_cache[record.index] = record.image
            prev = gray
    finished.extend(active)
    balls = [t for t in finished if ball_like(t, min_hits=7, min_speed=2.0, max_speed=45.0)]
    fps = info.fps
    print(f"quadros analisados: {len(per_frame)}  | manchas candidatas por quadro: mediana {np.median(per_frame):.0f}, p95 {np.percentile(per_frame, 95):.0f}, máx {max(per_frame)}")
    print(f"trilhas (qualquer): {len(finished)}  | com comportamento de bola: {len(balls)}")
    lengths = sorted((len(t.points) for t in balls), reverse=True)
    print("tamanho (quadros) das 10 maiores trilhas de bola:", lengths[:10])
    covered = set()
    for t in balls:
        covered.update(p[0] for p in t.points)
    print(f"quadros com ao menos uma trilha de bola ativa: {len(covered)} de {len(per_frame)} ({100 * len(covered) / len(per_frame):.0f}%)")

    # Verificação manual pontual: havia bola perto de check-xy por volta de check-time?
    lo, hi = int((args.check_time - 1.0) * fps), int((args.check_time + 1.0) * fps)
    near = [
        (t, p)
        for t in finished
        for p in t.points
        if lo <= p[0] <= hi and ((p[1] - args.check_xy[0]) ** 2 + (p[2] - args.check_xy[1]) ** 2) ** 0.5 <= 25
    ]
    print(f"verificação pontual: perto de {tuple(args.check_xy)} entre {args.check_time - 1:.0f}s e {args.check_time + 1:.0f}s há {len(near)} pontos candidatos "
          f"({len({id(t) for t, _ in near})} trilhas; {sum(ball_like(t, 7, 2.0, 45.0) for t in {id(t): t for t, _ in near}.values())} com comportamento de bola)")

    # Imagens: trilhas de bola desenhadas sobre quadros de 5 em 5 s.
    colors = [(0, 255, 255), (0, 165, 255), (255, 0, 255), (0, 255, 0), (255, 128, 0)]
    shots = []
    for sec in (5, 10, 15, 20, 25):
        idx = int(sec * fps) // 30 * 30
        img = frames_cache.get(idx)
        if img is None:
            continue
        canvas = img.copy()
        for k, t in enumerate(balls):
            near_pts = [p for p in t.points if abs(p[0] - idx) <= 15]
            for (_, x0, y0), (_, x1, y1) in zip(near_pts, near_pts[1:]):
                cv2.line(canvas, (int(x0), int(y0)), (int(x1), int(y1)), colors[k % 5], 2)
            if near_pts:
                cv2.circle(canvas, (int(near_pts[-1][1]), int(near_pts[-1][2])), 9, colors[k % 5], 2)
        cv2.putText(canvas, f"t={sec}s  trilhas de bola (candidatas)", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        shots.append(canvas)
    if shots:
        while len(shots) % 2:
            shots.append(np.zeros_like(shots[0]))
        rows = [np.hstack(shots[i : i + 2]) for i in range(0, len(shots), 2)]
        cv2.imwrite(str(args.out / "trilhas_de_bola.png"), np.vstack(rows))
    (args.out / "trilhas.json").write_text(
        json.dumps([{"quadros": [p[0] for p in t.points], "x": [round(p[1], 1) for p in t.points], "y": [round(p[2], 1) for p in t.points]} for t in balls]),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
