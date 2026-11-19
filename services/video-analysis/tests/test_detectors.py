from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from video_analysis.detectors import create_detector
from video_analysis.detectors.hog import HogDetector, suppress_overlaps
from video_analysis.detectors.yolox_onnx import (
    OUTPUT_WIDTH,
    YoloxOnnxDetector,
    build_grids,
    decode_outputs,
    letterbox,
    postprocess,
)
from video_analysis.errors import DetectorError

SIZE = (640, 640)


def raw_output(objects: list[tuple[int, int, int, float, float, float]]) -> np.ndarray:
    """Saída "crua" sintética (1, N, 85). Cada objeto: (célula x, célula y, passo, largura px, altura px, score) no passo dado."""
    grids, strides = build_grids(SIZE)
    raw = np.zeros((1, grids.shape[0], OUTPUT_WIDTH), dtype=np.float32)
    offsets = {8: 0, 16: (SIZE[0] // 8) * (SIZE[1] // 8), 32: (SIZE[0] // 8) * (SIZE[1] // 8) + (SIZE[0] // 16) * (SIZE[1] // 16)}
    for gx, gy, stride, w, h, score in objects:
        row = offsets[stride] + gy * (SIZE[0] // stride) + gx
        raw[0, row, 0:2] = 0.5  # centro no meio da célula
        raw[0, row, 2] = np.log(w / stride)
        raw[0, row, 3] = np.log(h / stride)
        raw[0, row, 4] = score  # objectness
        raw[0, row, 5] = 1.0  # classe 0 = pessoa
    return raw


class FakeSession:
    def __init__(self, output: np.ndarray, shape: tuple = (1, 3, 640, 640)) -> None:
        self.output, self.shape, self.last_input = output, shape, None

    def get_inputs(self):
        return [SimpleNamespace(name="images", shape=list(self.shape))]

    def run(self, _names, feed):
        self.last_input = feed["images"]
        return [self.output]


def test_letterbox_mantem_proporcao_e_completa_com_cinza() -> None:
    image = np.full((240, 320, 3), 200, dtype=np.uint8)
    tensor, ratio = letterbox(image, SIZE)
    assert tensor.shape == (1, 3, 640, 640) and tensor.dtype == np.float32
    assert ratio == pytest.approx(2.0)
    assert tensor[0, 0, 100, 100] == 200  # região da imagem, sem normalização
    assert tensor[0, 0, 600, 100] == 114  # faixa de preenchimento


def test_decodifica_e_devolve_caixa_nas_coordenadas_da_imagem_original() -> None:
    grids, strides = build_grids(SIZE)
    raw = raw_output([(10, 20, 8, 80, 160, 0.9)])
    decoded = decode_outputs(raw[0], grids, strides)
    detections = postprocess(decoded, ratio=2.0, confidence=0.3, nms_iou=0.45, image_size=(240, 320))
    assert len(detections) == 1
    box = detections[0].bbox
    # centro no modelo: ((10+.5)*8, (20+.5)*8) = (84, 164); caixa 80x160; ÷ razão 2 para voltar à imagem
    assert (box.x1, box.y1, box.x2, box.y2) == pytest.approx((22.0, 42.0, 62.0, 122.0), abs=0.5)
    assert detections[0].confidence == pytest.approx(0.9, abs=1e-4)


def test_nms_junta_duplicatas_e_ignora_outras_classes_e_baixa_confianca() -> None:
    grids, strides = build_grids(SIZE)
    raw = raw_output([(10, 20, 8, 80, 160, 0.9), (11, 20, 8, 80, 160, 0.8), (40, 40, 8, 60, 120, 0.1)])
    raw[0, :, 5] = np.where(raw[0, :, 4] > 0, 1.0, 0.0)
    cat = raw_output([(30, 30, 16, 100, 100, 0.95)])
    cat[0, :, 5] = 0.0
    cat[0, :, 6] = 1.0  # outra classe do COCO (bicicleta), não pessoa
    decoded = decode_outputs(np.maximum(raw[0], cat[0]), grids, strides)
    detections = postprocess(decoded, 1.0, 0.3, 0.45, (640, 640))
    assert len(detections) == 1  # duplicata fundida; classe errada e score baixo descartados


def test_detector_ponta_a_ponta_com_sessao_falsa() -> None:
    session = FakeSession(raw_output([(10, 20, 8, 80, 160, 0.9)]))
    detector = YoloxOnnxDetector(session=session)
    detections = detector.detect(np.zeros((480, 640, 3), dtype=np.uint8))
    assert len(detections) == 1 and detections[0].label == "person"
    assert session.last_input.shape == (1, 3, 640, 640)
    assert detector.info.code_license.startswith("Apache-2.0")
    detector.close()


def test_saida_com_formato_inesperado_vira_erro_claro() -> None:
    detector = YoloxOnnxDetector(session=FakeSession(np.zeros((1, 100, 6), dtype=np.float32)))
    with pytest.raises(DetectorError, match="Saída do modelo inesperada"):
        detector.detect(np.zeros((480, 640, 3), dtype=np.uint8))


def test_entrada_nao_multipla_de_32_e_recusada() -> None:
    with pytest.raises(DetectorError, match="múltiplo de 32"):
        YoloxOnnxDetector(session=FakeSession(np.zeros((1, 1, 85), dtype=np.float32)), input_size=(641, 640))


def test_falha_do_onnxruntime_vira_detector_error() -> None:
    class Broken(FakeSession):
        def run(self, _names, feed):
            raise RuntimeError("boom")

    with pytest.raises(DetectorError, match="inferência"):
        YoloxOnnxDetector(session=Broken(np.zeros((1, 1, 85), dtype=np.float32))).detect(np.zeros((64, 64, 3), dtype=np.uint8))


def test_pesos_ausentes_ou_invalidos(tmp_path: Path) -> None:
    with pytest.raises(DetectorError, match="--weights"):
        create_detector("yolox-onnx")
    with pytest.raises(DetectorError, match="não encontrado"):
        create_detector("yolox-onnx", weights=tmp_path / "nao_existe.onnx")
    broken = tmp_path / "quebrado.onnx"
    broken.write_bytes(b"isto nao e um modelo onnx")
    with pytest.raises(DetectorError, match="carregar o modelo"):
        create_detector("yolox-onnx", weights=broken)


def test_detector_desconhecido() -> None:
    with pytest.raises(DetectorError, match="desconhecido"):
        create_detector("inexistente")


def test_hog_roda_sem_pesos_externos_e_nao_inventa_pessoas_em_imagem_vazia() -> None:
    detector = create_detector("hog")
    assert isinstance(detector, HogDetector)
    assert detector.detect(np.full((240, 320, 3), 60, dtype=np.uint8)) == []
    assert "Apache-2.0" in detector.info.code_license


def test_supressao_do_hog_funciona_com_caixas_de_verdade() -> None:
    """Regressão: com caixas reais o NMSBoxes do OpenCV recusava o limiar negativo (só aparecia em vídeo real)."""
    rects = [[100, 50, 40, 110], [102, 52, 40, 110], [300, 60, 40, 110]]
    keep = suppress_overlaps(rects, [0.9, 0.6, 0.7], 0.4)
    assert sorted(keep) == [0, 2]  # duplicata de 0 removida, a terceira pessoa mantida
    assert suppress_overlaps([], [], 0.4) == []
