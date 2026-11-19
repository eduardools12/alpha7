import json
from pathlib import Path

import numpy as np
import pytest

from video_analysis.calibration import CourtCalibration, draw_calibration_overlay, load_calibration, save_calibration
from video_analysis.errors import CalibrationError

# Trapézio como uma meia quadra vista de trás: mais estreita ao fundo (topo) do que perto da câmera (base).
POINTS = ((100.0, 60.0), (220.0, 60.0), (300.0, 220.0), (20.0, 220.0))


def make(**kw) -> CourtCalibration:
    return CourtCalibration(POINTS, 9.0, 9.0, kw.get("frame_size", (320, 240)))


def test_cantos_da_imagem_viram_cantos_da_regiao() -> None:
    cal = make()
    for (px, py), expected in zip(POINTS, [(0, 0), (9, 0), (9, 9), (0, 9)]):
        assert cal.to_court(px, py) == pytest.approx(expected, abs=1e-3)


def test_ponto_do_meio_da_base_fica_no_meio_da_largura() -> None:
    x, y = make().to_court(160.0, 220.0)
    assert x == pytest.approx(4.5, abs=1e-3) and y == pytest.approx(9.0, abs=1e-3)


def test_contains_com_margem() -> None:
    cal = make()
    assert cal.contains(4.5, 4.5) and not cal.contains(-0.3, 4.5) and cal.contains(-0.3, 4.5, margin_m=0.5)


def test_exige_quatro_pontos_e_medidas_positivas() -> None:
    with pytest.raises(CalibrationError, match="4 pontos"):
        CourtCalibration(POINTS[:3], 9, 9)
    with pytest.raises(CalibrationError, match="positivas"):
        CourtCalibration(POINTS, 0, 9)


def test_ordem_errada_nao_forma_quadrilatero_convexo() -> None:
    gravata = (POINTS[0], POINTS[2], POINTS[1], POINTS[3])
    with pytest.raises(CalibrationError, match="convexo"):
        CourtCalibration(gravata, 9, 9)


def test_pontos_alinhados_sao_recusados() -> None:
    with pytest.raises(CalibrationError):
        CourtCalibration(((0, 0), (10, 0), (20, 0), (30, 0)), 9, 9)


def test_pontos_fora_da_imagem_sao_recusados() -> None:
    with pytest.raises(CalibrationError, match="fora da imagem"):
        CourtCalibration(((0, 0), (400, 0), (400, 200), (0, 200)), 9, 9, (320, 240))


def test_salvar_e_carregar_preserva_tudo(tmp_path: Path) -> None:
    file = tmp_path / "quadra.json"
    save_calibration(make(), file)
    loaded = load_calibration(file, (320, 240))
    assert loaded.image_points == POINTS and (loaded.width_m, loaded.length_m) == (9.0, 9.0)
    assert json.loads(file.read_text(encoding="utf-8"))["schema_version"] == "alpha7.court-calibration/1"


def test_calibracao_de_outro_tamanho_de_video_e_recusada(tmp_path: Path) -> None:
    file = tmp_path / "quadra.json"
    save_calibration(make(), file)
    with pytest.raises(CalibrationError, match="Refaça"):
        load_calibration(file, (640, 480))


def test_arquivo_ausente_ou_invalido(tmp_path: Path) -> None:
    with pytest.raises(CalibrationError, match="não encontrado"):
        load_calibration(tmp_path / "x.json")
    bad = tmp_path / "ruim.json"
    bad.write_text('{"schema_version": "outro"}', encoding="utf-8")
    with pytest.raises(CalibrationError, match="schema_version"):
        load_calibration(bad)
    bad.write_text("não é json", encoding="utf-8")
    with pytest.raises(CalibrationError):
        load_calibration(bad)


def test_sobreposicao_desenha_sem_alterar_o_original() -> None:
    image = np.full((240, 320, 3), 50, dtype=np.uint8)
    out = draw_calibration_overlay(image, make())
    assert out.shape == image.shape and not np.array_equal(out, image)
    assert np.all(image == 50)
