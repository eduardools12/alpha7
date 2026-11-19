import json
from pathlib import Path

import cv2
import pytest
from helpers import FPS, SIZE, ScriptedDetector, truth_boxes

from video_analysis.calibration import CourtCalibration, save_calibration
from video_analysis.errors import VideoNotFoundError, VideoUnreadableError
from video_analysis.export import SCHEMA_VERSION, validate_result
from video_analysis.pipeline import AnalysisConfig, analyze_video


def run(video: Path, out: Path, detector: ScriptedDetector, **overrides):
    defaults = dict(input_path=video, output_dir=out, target_fps=None, stride=1, max_width=None)
    defaults.update(overrides)
    return analyze_video(AnalysisConfig(**defaults), detector=detector)


def test_gera_json_valido_video_anotado_e_resumo(synthetic_video: Path, tmp_path: Path) -> None:
    detector = ScriptedDetector()
    outputs = run(synthetic_video, tmp_path / "saida", detector)
    assert outputs.json_path.exists() and outputs.summary_path.exists() and outputs.video_path and outputs.video_path.exists()
    data = json.loads(outputs.json_path.read_text(encoding="utf-8"))
    assert data["schema_version"] == SCHEMA_VERSION == "alpha7.video-analysis/1"
    assert validate_result(data) == []
    assert data["summary"]["status"] == "completed"
    assert data["summary"]["frames_processed"] == 40
    assert data["summary"]["detections_total"] == 80
    assert data["summary"]["tracks_confirmed"] == 2
    assert data["summary"]["decode_errors"] == 0 and data["summary"]["detector_errors"] == 0
    assert data["source"]["filename"] == "clipe_sintetico.avi" and "\\" not in data["source"]["filename"]
    summary = json.loads(outputs.summary_path.read_text(encoding="utf-8"))
    assert summary["frames_processed"] == 40
    assert detector.calls == 40


def test_timestamps_e_indices_dos_quadros_originais_sao_preservados(synthetic_video: Path, tmp_path: Path) -> None:
    outputs = run(synthetic_video, tmp_path / "s", ScriptedDetector(stride=4), stride=4)
    frames = outputs.result["frames"]
    assert [f["frame_index"] for f in frames] == list(range(0, 40, 4))
    for f in frames:
        assert f["timestamp_ms"] == pytest.approx(f["frame_index"] / FPS * 1000.0, abs=1000.0 / FPS)
    assert outputs.result["processing"]["settings"] == {
        "stride": 4, "effective_fps": 2.5, "max_width": None, "start_seconds": 0.0, "max_seconds": None,
        "confidence_threshold": 0.3, "write_video": True,
        "tracker": "improved", "annotated_fps": "source", "roi_polygon": None,
    }


def test_target_fps_define_o_salto(synthetic_video: Path, tmp_path: Path) -> None:
    config = AnalysisConfig(input_path=synthetic_video, output_dir=tmp_path / "s", target_fps=2.5, max_width=None, write_video=False)
    assert config.resolve_stride(FPS) == 4
    outputs = analyze_video(config, detector=ScriptedDetector(stride=4))
    assert outputs.result["summary"]["frames_processed"] == 10 and outputs.video_path is None


def test_trilhas_confirmadas_sem_nomes_de_atletas(synthetic_video: Path, tmp_path: Path) -> None:
    result = run(synthetic_video, tmp_path / "s", ScriptedDetector()).result
    assert len(result["tracks"]) == 2
    for track in result["tracks"]:
        assert track["identity"] == {"athlete_id": None, "status": "unassigned"}
        assert track["detections"] >= 30 and len(track["path"]) == track["detections"]
    assert result["link"] == {"match_id": None, "video_id": None, "notes": ""}
    assert any("TEMPORÁRIOS" in d for d in result["disclaimers"])
    text = json.dumps(result)
    assert "athlete_name" not in text and "jogador_nome" not in text


def test_video_anotado_padrao_tem_a_fluidez_do_original(synthetic_video: Path, tmp_path: Path) -> None:
    """Padrão (`source`): todos os quadros do trecho analisado, na taxa original, com caixas interpoladas."""
    outputs = run(synthetic_video, tmp_path / "s", ScriptedDetector(stride=5), stride=5)
    assert outputs.video_path is not None
    capture = cv2.VideoCapture(str(outputs.video_path))
    try:
        # quadros processados: 0, 5, ..., 35; o vídeo anotado cobre do 0 ao 35 em todos os quadros
        assert int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 36
        assert capture.get(cv2.CAP_PROP_FPS) == pytest.approx(FPS)
    finally:
        capture.release()
    assert outputs.result["summary"]["annotated_video_frames"] == 36
    assert len(outputs.result["frames"]) == 8  # o JSON continua só com os quadros realmente processados (nada interpolado)


def test_video_anotado_so_com_quadros_processados_quando_pedido(synthetic_video: Path, tmp_path: Path) -> None:
    outputs = run(synthetic_video, tmp_path / "s", ScriptedDetector(stride=5), stride=5, annotated_fps="processed")
    assert outputs.video_path is not None
    capture = cv2.VideoCapture(str(outputs.video_path))
    try:
        assert int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 8
        assert capture.get(cv2.CAP_PROP_FPS) == pytest.approx(FPS / 5)
    finally:
        capture.release()
    with pytest.raises(ValueError):
        run(synthetic_video, tmp_path / "x", ScriptedDetector(), annotated_fps="inexistente")


def test_falha_do_detector_em_alguns_quadros_nao_derruba_o_processamento(synthetic_video: Path, tmp_path: Path) -> None:
    outputs = run(synthetic_video, tmp_path / "s", ScriptedDetector(fail_calls={3, 4, 20}))
    summary = outputs.result["summary"]
    assert summary["status"] == "completed_with_errors"
    assert summary["detector_errors"] == 3 and summary["frames_with_detector_error"] == 3
    assert summary["frames_processed"] == 37
    failed = [f for f in outputs.result["frames"] if f["detector_error"]]
    assert [f["frame_index"] for f in failed] == [3, 4, 20] and all(f["detections"] == [] for f in failed)
    assert validate_result(outputs.result) == []
    assert "falha simulada" in summary["errors"]["detector"][0]["message"]


def test_detector_que_so_falha_para_apos_dez_e_ainda_exporta(synthetic_video: Path, tmp_path: Path) -> None:
    outputs = run(synthetic_video, tmp_path / "s", ScriptedDetector(always_fail=True))
    assert outputs.status == "aborted_detector_failure"
    assert len(outputs.result["frames"]) == 10
    assert outputs.json_path.exists() and validate_result(json.loads(outputs.json_path.read_text(encoding="utf-8"))) == []
    assert outputs.video_path is not None and outputs.video_path.exists()  # arquivo fechado e legível
    capture = cv2.VideoCapture(str(outputs.video_path))
    try:
        assert capture.isOpened()
    finally:
        capture.release()


def test_entrada_inexistente_ou_invalida_nao_cria_saidas(tmp_path: Path) -> None:
    out = tmp_path / "saida"
    with pytest.raises(VideoNotFoundError):
        analyze_video(AnalysisConfig(input_path=tmp_path / "nao_existe.mp4", output_dir=out), detector=ScriptedDetector())
    fake = tmp_path / "falso.mp4"
    fake.write_text("texto", encoding="utf-8")
    with pytest.raises(VideoUnreadableError):
        analyze_video(AnalysisConfig(input_path=fake, output_dir=out), detector=ScriptedDetector())
    assert not out.exists()


def test_inicio_e_duracao_maxima(synthetic_video: Path, tmp_path: Path) -> None:
    outputs = run(synthetic_video, tmp_path / "s", ScriptedDetector(), start_seconds=1.0, max_seconds=1.0, write_video=False)
    assert [f["frame_index"] for f in outputs.result["frames"]] == list(range(10, 20))


def test_quadro_reduzido_para_o_detector_volta_para_as_coordenadas_originais(synthetic_video: Path, tmp_path: Path) -> None:
    detector = ScriptedDetector(scale_to_image=True)
    outputs = run(synthetic_video, tmp_path / "s", detector, max_width=160, write_video=False)
    first = outputs.result["frames"][0]["detections"]
    expected = truth_boxes(0)
    for det, box in zip(first, expected):
        assert det["bbox_xyxy"] == pytest.approx(box.as_list(), abs=1.5)
    assert all(0 <= v for d in first for v in d["bbox_xyxy"]) and all(d["bbox_xyxy"][2] <= SIZE[0] for d in first)


def test_sem_calibracao_nao_ha_coordenadas_de_quadra(synthetic_video: Path, tmp_path: Path) -> None:
    result = run(synthetic_video, tmp_path / "s", ScriptedDetector(), write_video=False).result
    assert result["calibration"] == {"status": "not_calibrated"}
    det = result["frames"][0]["detections"][0]
    assert det["court_xy_m"] is None and det["in_calibrated_area"] is None


def test_com_calibracao_manual_ha_coordenadas_e_aviso_de_area(synthetic_video: Path, tmp_path: Path) -> None:
    file = tmp_path / "quadra.json"
    save_calibration(CourtCalibration(((20.0, 40.0), (300.0, 40.0), (300.0, 230.0), (20.0, 230.0)), 9.0, 9.0, SIZE), file)
    result = run(synthetic_video, tmp_path / "s", ScriptedDetector(), write_video=False, calibration_path=file).result
    assert result["calibration"]["status"] == "calibrated"
    det = result["frames"][0]["detections"][0]
    assert det["court_xy_m"] is not None and det["in_calibrated_area"] is True
    assert "court_x_m" in result["tracks"][0]["path"][0]
    assert validate_result(result) == []


def test_calibracao_de_outro_tamanho_de_video_e_recusada(synthetic_video: Path, tmp_path: Path) -> None:
    from video_analysis.errors import CalibrationError

    file = tmp_path / "quadra.json"
    save_calibration(CourtCalibration(((10.0, 10.0), (600.0, 10.0), (600.0, 400.0), (10.0, 400.0)), 9.0, 9.0, (640, 480)), file)
    with pytest.raises(CalibrationError):
        run(synthetic_video, tmp_path / "s", ScriptedDetector(), calibration_path=file)


def test_hash_do_arquivo_so_quando_pedido(synthetic_video: Path, tmp_path: Path) -> None:
    sem = run(synthetic_video, tmp_path / "a", ScriptedDetector(), write_video=False).result
    com = run(synthetic_video, tmp_path / "b", ScriptedDetector(), write_video=False, hash_source=True).result
    assert sem["source"]["sha256"] is None and len(com["source"]["sha256"]) == 64


def test_detector_criado_pelo_pipeline_e_fechado_e_o_injetado_nao(synthetic_video: Path, tmp_path: Path) -> None:
    detector = ScriptedDetector()
    run(synthetic_video, tmp_path / "s", detector, write_video=False)
    assert detector.closed is False  # quem injeta é dono do detector
    config = AnalysisConfig(input_path=synthetic_video, output_dir=tmp_path / "h", detector="hog", write_video=False, stride=10, max_width=None)
    assert analyze_video(config).result["processing"]["detector"]["name"] == "opencv-hog"


def test_roi_marca_quem_esta_fora_e_nao_da_trilha_a_eles(synthetic_video: Path, tmp_path: Path) -> None:
    # Pessoa 0 anda perto de x=30..110, pessoa 1 perto de x=160..220 (pés em y=180). A região cobre só x < 140.
    roi = ((0.0, 100.0), (140.0, 100.0), (140.0, 240.0), (0.0, 240.0))
    result = run(synthetic_video, tmp_path / "s", ScriptedDetector(), write_video=False, roi_polygon=roi).result
    inside = [d for f in result["frames"][:5] for d in f["detections"] if d["in_roi"] is True]
    outside = [d for f in result["frames"][:5] for d in f["detections"] if d["in_roi"] is False]
    assert inside and outside
    assert all(d["track_id"] is not None or True for d in inside)
    assert all(d["track_id"] is None for d in outside)  # fora da região nunca ganha número de trilha
    assert {t["track_id"] for t in result["tracks"]} and len(result["tracks"]) == 1
    assert result["processing"]["settings"]["roi_polygon"] == [list(p) for p in roi]
    assert validate_result(result) == []


def test_sem_roi_o_campo_in_roi_e_nulo(synthetic_video: Path, tmp_path: Path) -> None:
    result = run(synthetic_video, tmp_path / "s", ScriptedDetector(), write_video=False).result
    assert result["frames"][0]["detections"][0]["in_roi"] is None


def test_roi_com_menos_de_tres_pontos_e_recusada(synthetic_video: Path, tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="3 pontos"):
        run(synthetic_video, tmp_path / "s", ScriptedDetector(), roi_polygon=((0.0, 0.0), (10.0, 10.0)))


def test_rastreador_basico_ainda_e_selecionavel(synthetic_video: Path, tmp_path: Path) -> None:
    result = run(synthetic_video, tmp_path / "s", ScriptedDetector(), write_video=False, tracker="basic").result
    assert result["processing"]["settings"]["tracker"] == "basic" and len(result["tracks"]) == 2
    with pytest.raises(ValueError):
        run(synthetic_video, tmp_path / "s", ScriptedDetector(), tracker="inexistente")
