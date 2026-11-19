"""Linha de comando: `python -m video_analysis --input video.mp4 --output saida/`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

import cv2

from .calibration import CourtCalibration, draw_calibration_overlay, save_calibration
from .detectors import DETECTOR_NAMES
from .errors import CalibrationError, DetectorError, OutputError, VideoAnalysisError, VideoNotFoundError, VideoUnreadableError
from .export import summary_text, validate_result
from .pipeline import AnalysisConfig, Progress, analyze_video
from .video_io import FrameReader, probe_video

EXIT_OK, EXIT_USAGE, EXIT_INPUT, EXIT_SETUP, EXIT_PARTIAL, EXIT_OUTPUT = 0, 2, 3, 4, 5, 6
_SUBCOMMANDS = {"analyze", "calibrate-frame", "calibrate-check", "validate"}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="video_analysis",
        description="Detecta pessoas e rastreia trilhas TEMPORÁRIAS em vídeos de voleibol. Não identifica atletas nem gera estatísticas de fundamentos.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("analyze", help="analisa um vídeo (comando padrão)")
    run.add_argument("--input", required=True, type=Path, help="caminho do vídeo")
    run.add_argument("--output", required=True, type=Path, help="pasta de saída (criada se não existir)")
    run.add_argument("--detector", choices=DETECTOR_NAMES, default="hog", help="detector de pessoas (padrão: hog, sem pesos)")
    run.add_argument("--weights", type=Path, help="arquivo .onnx do modelo (obrigatório para yolox-onnx)")
    run.add_argument("--target-fps", type=float, default=5.0, help="quadros por segundo a processar (padrão: 5)")
    run.add_argument("--stride", type=int, help="processar 1 a cada N quadros (substitui --target-fps)")
    run.add_argument("--max-width", type=int, default=960, help="largura máxima enviada ao detector; 0 = original (padrão: 960)")
    run.add_argument("--start", type=float, default=0.0, dest="start_seconds", help="começar neste segundo")
    run.add_argument("--max-seconds", type=float, help="processar no máximo N segundos (recomendado: clipes de 30 a 60 s)")
    run.add_argument("--confidence", type=float, default=0.3, help="confiança mínima do detector (padrão: 0.3)")
    run.add_argument("--no-video", action="store_true", help="não gerar o vídeo anotado")
    run.add_argument("--calibration", type=Path, help="JSON de calibração da quadra (opcional)")
    run.add_argument("--hash", action="store_true", dest="hash_source", help="calcular o SHA-256 do vídeo e gravá-lo no JSON")
    run.add_argument("--threads", type=int, help="threads do onnxruntime (padrão: automático)")
    run.add_argument("--tracker", choices=("improved", "basic"), default="improved", help="rastreador (padrão: improved, com recuperação de trilhas e cor; basic = fase 1)")
    run.add_argument("--roi", type=float, nargs="+", metavar="PX", help="região de interesse: x1 y1 x2 y2 x3 y3 ... (3 ou mais pontos, pixels do vídeo original); quem tem os pés fora não ganha trilha")
    run.add_argument("--annotated-fps", choices=("source", "processed"), default="source", help="vídeo anotado na fluidez do original com caixas interpoladas (source, padrão) ou só nos quadros processados (processed)")
    run.add_argument("--quiet", action="store_true", help="não mostrar o progresso")

    frame = sub.add_parser("calibrate-frame", help="salva um quadro do vídeo em PNG para marcar os 4 cantos da quadra")
    frame.add_argument("--input", required=True, type=Path)
    frame.add_argument("--output", required=True, type=Path, help="arquivo .png de saída")
    frame.add_argument("--at", type=float, default=0.0, help="segundo do vídeo (padrão: 0)")

    check = sub.add_parser("calibrate-check", help="cria a calibração a partir de 4 pontos e desenha a grade sobre um quadro para conferir")
    check.add_argument("--input", required=True, type=Path)
    check.add_argument("--points", required=True, type=float, nargs=8, metavar="PX", help="x y de topo-esq, topo-dir, base-dir, base-esq, em pixels do vídeo original")
    check.add_argument("--width-m", required=True, type=float, help="largura real da região marcada, em metros")
    check.add_argument("--length-m", required=True, type=float, help="comprimento real da região marcada, em metros")
    check.add_argument("--at", type=float, default=0.0)
    check.add_argument("--save", type=Path, help="grava o JSON de calibração (para usar em --calibration)")
    check.add_argument("--preview", type=Path, help="grava o quadro com a grade desenhada (.png)")

    validate = sub.add_parser("validate", help="confere a estrutura de um .analysis.json")
    validate.add_argument("file", type=Path)
    return parser


def _print_progress(p: Progress) -> None:
    total = f"/{p.frames_expected}" if p.frames_expected else ""
    print(f"  ... {p.frames_done}{total} quadros, {p.video_seconds:.0f}s de vídeo, {p.elapsed_seconds:.0f}s de processamento", file=sys.stderr, flush=True)


def _read_frame_at(path: Path, seconds: float):
    info = probe_video(path)
    with FrameReader(path, info, start_seconds=seconds) as reader:
        for record in reader.frames():
            return info, record.image
    raise VideoUnreadableError(f"Não foi possível ler um quadro de {path.name} em {seconds}s.")


def _roi_points(values: list[float] | None) -> tuple[tuple[float, float], ...] | None:
    if not values:
        return None
    if len(values) % 2 or len(values) < 6:
        raise CalibrationError("--roi precisa de pares x y, com pelo menos 3 pontos.")
    return tuple((values[i], values[i + 1]) for i in range(0, len(values), 2))


def _run(args: argparse.Namespace) -> int:
    if args.command == "analyze":
        config = AnalysisConfig(
            input_path=args.input,
            output_dir=args.output,
            detector=args.detector,
            weights=args.weights,
            target_fps=None if args.stride else args.target_fps,
            stride=args.stride,
            max_width=args.max_width or None,
            start_seconds=args.start_seconds,
            max_seconds=args.max_seconds,
            confidence=args.confidence,
            write_video=not args.no_video,
            calibration_path=args.calibration,
            hash_source=args.hash_source,
            threads=args.threads,
            tracker=args.tracker,
            annotated_fps=args.annotated_fps,
            roi_polygon=_roi_points(args.roi),
        )
        outputs = analyze_video(config, progress=None if args.quiet else _print_progress)
        print(summary_text(outputs.result))
        print(f"\nJSON:    {outputs.json_path}\nResumo:  {outputs.summary_path}\nVídeo:   {outputs.video_path or '(não gerado)'}")
        return EXIT_OK if outputs.status in {"completed", "completed_with_errors"} else EXIT_PARTIAL

    if args.command == "calibrate-frame":
        _, image = _read_frame_at(args.input, args.at)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(args.output), image):
            raise OutputError(f"Não foi possível gravar {args.output}.")
        print(f"Quadro salvo em {args.output} ({image.shape[1]}x{image.shape[0]}). Abra a imagem, anote os 4 cantos em pixels e use calibrate-check.")
        return EXIT_OK

    if args.command == "calibrate-check":
        info, image = _read_frame_at(args.input, args.at)
        p = args.points
        calibration = CourtCalibration(((p[0], p[1]), (p[2], p[3]), (p[4], p[5]), (p[6], p[7])), args.width_m, args.length_m, (info.width, info.height))
        if args.save:
            save_calibration(calibration, args.save)
            print(f"Calibração gravada em {args.save}")
        if args.preview:
            args.preview.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(args.preview), draw_calibration_overlay(image, calibration))
            print(f"Prévia gravada em {args.preview}. Confira se a grade acompanha as linhas reais do chão.")
        if not args.save and not args.preview:
            print("Calibração válida. Use --save e/ou --preview para gravar.")
        return EXIT_OK

    if args.command == "validate":
        try:
            data = json.loads(args.file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise OutputError(f"Não foi possível ler {args.file}: {error}") from error
        problems = validate_result(data)
        if problems:
            print("JSON inválido:\n- " + "\n- ".join(problems[:20]))
            return EXIT_OUTPUT
        print("JSON válido.")
        return EXIT_OK
    return EXIT_USAGE


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    # `python -m video_analysis --input x --output y` sem subcomando equivale a `analyze`.
    if arguments and arguments[0] not in _SUBCOMMANDS and arguments[0] not in {"-h", "--help"}:
        arguments.insert(0, "analyze")
    args = _parser().parse_args(arguments)
    try:
        return _run(args)
    except (VideoNotFoundError, VideoUnreadableError) as error:
        print(f"Erro de entrada: {error}", file=sys.stderr)
        return EXIT_INPUT
    except (DetectorError, CalibrationError) as error:
        print(f"Erro de configuração: {error}", file=sys.stderr)
        return EXIT_SETUP
    except OutputError as error:
        print(f"Erro de saída: {error}", file=sys.stderr)
        return EXIT_OUTPUT
    except VideoAnalysisError as error:
        print(f"Erro: {error}", file=sys.stderr)
        return EXIT_PARTIAL
    except KeyboardInterrupt:
        print("Interrompido.", file=sys.stderr)
        return 130
