import json
from pathlib import Path

import cv2
import pytest

from video_analysis.cli import main
from video_analysis.export import SCHEMA_VERSION


def test_comando_sem_subcomando_analisa_e_grava_json_valido(synthetic_video: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["--input", str(synthetic_video), "--output", str(tmp_path / "out"), "--detector", "hog", "--stride", "10", "--no-video", "--quiet"])
    assert code == 0
    out = capsys.readouterr().out
    assert "Quadros processados: 4" in out and "não identificam atletas" in out
    data = json.loads((tmp_path / "out" / "clipe_sintetico.analysis.json").read_text(encoding="utf-8"))
    assert data["schema_version"] == SCHEMA_VERSION
    assert main(["validate", str(tmp_path / "out" / "clipe_sintetico.analysis.json")]) == 0


def test_video_inexistente_sai_com_codigo_3_e_mensagem(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--input", str(tmp_path / "nada.mp4"), "--output", str(tmp_path / "o")]) == 3
    assert "Erro de entrada" in capsys.readouterr().err


def test_yolox_sem_pesos_sai_com_codigo_4(synthetic_video: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--input", str(synthetic_video), "--output", str(tmp_path / "o"), "--detector", "yolox-onnx"]) == 4
    assert "--weights" in capsys.readouterr().err


def test_validate_recusa_json_com_problema(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    bad = tmp_path / "ruim.json"
    bad.write_text(json.dumps({"schema_version": "outro"}), encoding="utf-8")
    assert main(["validate", str(bad)]) == 6
    assert "JSON inválido" in capsys.readouterr().out


def test_calibrar_salva_quadro_calibracao_e_previa(synthetic_video: Path, tmp_path: Path) -> None:
    frame = tmp_path / "quadro.png"
    assert main(["calibrate-frame", "--input", str(synthetic_video), "--output", str(frame), "--at", "1.0"]) == 0
    assert cv2.imread(str(frame)).shape[:2] == (240, 320)
    saved, preview = tmp_path / "quadra.json", tmp_path / "previa.png"
    code = main(["calibrate-check", "--input", str(synthetic_video), "--points", "100", "60", "220", "60", "300", "220", "20", "220",
                 "--width-m", "9", "--length-m", "9", "--save", str(saved), "--preview", str(preview)])
    assert code == 0 and saved.exists() and preview.exists()
    out = tmp_path / "out"
    assert main(["--input", str(synthetic_video), "--output", str(out), "--stride", "20", "--no-video", "--quiet", "--calibration", str(saved)]) == 0
    assert json.loads((out / "clipe_sintetico.analysis.json").read_text(encoding="utf-8"))["calibration"]["status"] == "calibrated"


def test_calibracao_invalida_sai_com_codigo_4(synthetic_video: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["calibrate-check", "--input", str(synthetic_video), "--points", "100", "60", "300", "220", "220", "60", "20", "220", "--width-m", "9", "--length-m", "9"])
    assert code == 4 and "convexo" in capsys.readouterr().err
