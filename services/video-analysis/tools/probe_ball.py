"""TESTE DE VIABILIDADE (descartável): o YOLOX do COCO acha a bola neste vídeo?

O COCO tem a classe "sports ball" (índice 32). Aqui perguntamos ao mesmo modelo, sem treinar nada, por essa classe, em
quadro inteiro e em recortes ampliados (a bola é pequena). Não há anotação manual da posição da bola: o resultado é
contagem de candidatos + conferência visual, nunca uma taxa de acerto.

    python tools/probe_ball.py --input video.mp4 --weights models/yolox_s.onnx --seconds 30 --out out/bola
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from video_analysis.detectors.yolox_onnx import build_grids, decode_outputs, letterbox  # noqa: E402
from video_analysis.video_io import FrameReader, probe_video  # noqa: E402

BALL = 32


def ball_candidates(session, grids, strides, image, conf: float, offset=(0, 0), size=(640, 640)):
    tensor, ratio = letterbox(image, size)
    raw = session.run(None, {session.get_inputs()[0].name: tensor})[0][0]
    out = decode_outputs(raw, grids, strides)
    scores = out[:, 4] * out[:, 5 + BALL]
    keep = scores >= conf
    boxes, sc = out[keep, :4], scores[keep]
    rects = [[float((b[0] - b[2] / 2) / ratio), float((b[1] - b[3] / 2) / ratio), float(b[2] / ratio), float(b[3] / ratio)] for b in boxes]
    idx = cv2.dnn.NMSBoxes(rects, [float(s) for s in sc], conf, 0.45) if rects else []
    found = []
    for i in np.asarray(idx).reshape(-1):
        x, y, w, h = rects[int(i)]
        found.append([x + offset[0], y + offset[1], x + w + offset[0], y + h + offset[1], float(sc[int(i)])])
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--weights", required=True, type=Path)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--stride", type=int, default=3)
    parser.add_argument("--conf", type=float, default=0.10)
    parser.add_argument("--out", type=Path, default=Path("out/bola"))
    args = parser.parse_args()
    import onnxruntime as ort

    session = ort.InferenceSession(str(args.weights), providers=["CPUExecutionProvider"])
    grids, strides = build_grids((640, 640))
    info = probe_video(args.input)
    args.out.mkdir(parents=True, exist_ok=True)
    rows = []
    with FrameReader(args.input, info, stride=args.stride, max_seconds=args.seconds) as reader:
        for record in reader.frames():
            img = record.image
            h, w = img.shape[:2]
            full = ball_candidates(session, grids, strides, img, args.conf)
            half = w // 2 + 40
            tiles = ball_candidates(session, grids, strides, img[:, :half], args.conf, (0, 0)) + ball_candidates(
                session, grids, strides, img[:, w - half :], args.conf, (w - half, 0)
            )
            rows.append({"i": record.index, "t": round(record.timestamp_ms / 1000, 2), "full": full, "tiles": tiles})
            if record.index in (600, 603, 606, 609):  # ~20 s
                for name, items in (("full", full), ("tiles", tiles)):
                    canvas = img.copy()
                    for x1, y1, x2, y2, s in items:
                        cv2.rectangle(canvas, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 255), 2)
                        cv2.putText(canvas, f"{s:.2f}", (int(x1), max(12, int(y1) - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
                    cv2.imwrite(str(args.out / f"q{record.index}_{name}.png"), canvas)
    n = len(rows)
    for name in ("full", "tiles"):
        with_any = sum(1 for r in rows if r[name])
        strong = sum(1 for r in rows if any(c[4] >= 0.3 for c in r[name]))
        per = [len(r[name]) for r in rows]
        print(f"{name:6} quadros={n}  com candidato (>= {args.conf})={with_any}  com candidato forte (>= 0.3)={strong}  candidatos por quadro: mediana {np.median(per):.0f}, máx {max(per)}")
    (args.out / "candidatos.json").write_text(json.dumps(rows), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
