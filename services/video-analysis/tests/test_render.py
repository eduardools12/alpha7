from pathlib import Path

import cv2
import numpy as np
import pytest
from helpers import FPS, SIZE

from video_analysis.errors import OutputError
from video_analysis.render import AnnotatedVideoWriter, draw_overlay, interpolate_detections, track_color
from video_analysis.types import BBox, TrackedDetection


def frame() -> np.ndarray:
    return np.full((SIZE[1], SIZE[0], 3), 60, dtype=np.uint8)


def test_overlay_desenha_em_copia_e_nao_altera_o_original() -> None:
    original = frame()
    out = draw_overlay(original, [TrackedDetection(3, BBox(50, 50, 100, 180), 0.87)], frame_index=12, timestamp_ms=1200.0)
    assert np.all(original == 60)
    assert not np.array_equal(out, original)
    assert tuple(out[50, 75]) == track_color(3)  # a borda da caixa tem a cor da trilha


def test_trilhas_diferentes_tem_cores_diferentes_e_sem_trilha_e_cinza() -> None:
    assert track_color(1) != track_color(2)
    assert track_color(None) == (170, 170, 170)


def test_escreve_video_legivel_com_todos_os_quadros(tmp_path: Path) -> None:
    path = tmp_path / "saida" / "anotado.mp4"
    with AnnotatedVideoWriter(path, FPS, SIZE) as writer:
        for _ in range(8):
            writer.write(frame())
        assert writer.frames_written == 8
    capture = cv2.VideoCapture(str(path))
    try:
        assert capture.isOpened() and int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 8
        assert capture.get(cv2.CAP_PROP_FPS) == pytest.approx(FPS)
    finally:
        capture.release()


def test_release_e_idempotente_e_escrever_depois_e_erro(tmp_path: Path) -> None:
    writer = AnnotatedVideoWriter(tmp_path / "a.mp4", FPS, SIZE)
    writer.write(frame())
    writer.release()
    writer.release()
    with pytest.raises(OutputError, match="encerrado"):
        writer.write(frame())


def test_tamanho_de_quadro_errado_e_recusado(tmp_path: Path) -> None:
    with AnnotatedVideoWriter(tmp_path / "a.mp4", FPS, SIZE) as writer:
        with pytest.raises(OutputError, match="diferente"):
            writer.write(np.zeros((10, 10, 3), dtype=np.uint8))


def test_arquivo_fica_fechado_e_legivel_mesmo_se_o_processamento_falhar_no_meio(tmp_path: Path) -> None:
    path = tmp_path / "parcial.mp4"
    with pytest.raises(RuntimeError):
        with AnnotatedVideoWriter(path, FPS, SIZE) as writer:
            for _ in range(5):
                writer.write(frame())
            raise RuntimeError("falha no meio")
    assert writer._writer is None
    capture = cv2.VideoCapture(str(path))
    try:
        assert capture.isOpened() and int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 5
    finally:
        capture.release()


def test_pasta_de_saida_sem_permissao_vira_output_error(tmp_path: Path) -> None:
    blocker = tmp_path / "arquivo"
    blocker.write_text("x", encoding="utf-8")
    with pytest.raises((OutputError, OSError, NotADirectoryError, FileExistsError)):
        AnnotatedVideoWriter(blocker / "sub" / "a.mp4", FPS, SIZE)


def test_interpolacao_move_a_mesma_trilha_em_linha_reta() -> None:
    a = [TrackedDetection(1, BBox(0, 0, 40, 100), 0.9)]
    b = [TrackedDetection(1, BBox(100, 20, 140, 120), 0.8)]
    mid = interpolate_detections(a, b, 0.5)
    assert len(mid) == 1 and mid[0].track_id == 1
    assert (mid[0].bbox.x1, mid[0].bbox.y1, mid[0].bbox.x2, mid[0].bbox.y2) == pytest.approx((50, 10, 90, 110))
    assert interpolate_detections(a, b, 0.0)[0].bbox == a[0].bbox
    assert interpolate_detections(a, b, 1.0)[0].bbox == b[0].bbox
    assert interpolate_detections(a, None, 0.5) == a  # sem quadro seguinte, mantém o anterior


def test_interpolacao_quem_so_aparece_de_um_lado_some_ou_surge_na_metade() -> None:
    gone = TrackedDetection(1, BBox(0, 0, 40, 100), 0.9)
    new = TrackedDetection(2, BBox(200, 0, 240, 100), 0.9)
    assert [d.track_id for d in interpolate_detections([gone], [new], 0.25)] == [1]
    assert [d.track_id for d in interpolate_detections([gone], [new], 0.75)] == [2]
