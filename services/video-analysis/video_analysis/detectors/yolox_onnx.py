"""Detector YOLOX (exportado para ONNX) executado com onnxruntime em CPU.

Por que YOLOX: código sob Apache-2.0 e pesos pré-treinados no COCO distribuídos pelo próprio repositório (Megvii),
em ONNX pronto, sem exigir PyTorch. A licença dos PESOS não é declarada à parte (ver README). Os pesos NÃO acompanham este repositório: o arquivo `.onnx` é informado em
`--weights`. Veja `README.md` (seção Modelo e licenças) para a verificação de licença e o que ainda falta confirmar.

O pré e o pós-processamento seguem o demo oficial de ONNX do YOLOX: letterbox com cinza 114, BGR em 0..255 sem
normalizar, saída "crua" (1, N, 85) decodificada com grades e passos 8/16/32, depois NMS.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, Sequence

import cv2
import numpy as np

from ..errors import DetectorError
from ..types import BBox, Detection
from .base import DetectorInfo

YOLOX_STRIDES = (8, 16, 32)
PERSON_CLASS = 0  # índice de "person" no COCO
PAD_VALUE = 114
NUM_COCO_CLASSES = 80
OUTPUT_WIDTH = 5 + NUM_COCO_CLASSES


class _Session(Protocol):
    """O pedaço de `onnxruntime.InferenceSession` que usamos (permite trocar por um falso nos testes)."""

    def get_inputs(self) -> Sequence[Any]: ...

    def run(self, output_names: Any, input_feed: dict[str, np.ndarray]) -> list[np.ndarray]: ...


def letterbox(image_bgr: np.ndarray, size: tuple[int, int]) -> tuple[np.ndarray, float]:
    """Redimensiona mantendo a proporção e completa com cinza. Devolve (CHW float32 com batch, razão de escala)."""
    in_h, in_w = size
    h, w = image_bgr.shape[:2]
    ratio = min(in_h / h, in_w / w)
    new_w, new_h = int(round(w * ratio)), int(round(h * ratio))
    resized = cv2.resize(image_bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((in_h, in_w, 3), PAD_VALUE, dtype=np.uint8)
    canvas[:new_h, :new_w] = resized
    tensor = canvas.transpose(2, 0, 1).astype(np.float32)[None]
    return np.ascontiguousarray(tensor), ratio


def build_grids(size: tuple[int, int], strides: Sequence[int] = YOLOX_STRIDES) -> tuple[np.ndarray, np.ndarray]:
    in_h, in_w = size
    grids, expanded = [], []
    for stride in strides:
        gh, gw = in_h // stride, in_w // stride
        xs, ys = np.meshgrid(np.arange(gw), np.arange(gh))
        grid = np.stack((xs, ys), axis=2).reshape(-1, 2)
        grids.append(grid)
        expanded.append(np.full((grid.shape[0], 1), stride))
    return np.concatenate(grids, axis=0).astype(np.float32), np.concatenate(expanded, axis=0).astype(np.float32)


def decode_outputs(raw: np.ndarray, grids: np.ndarray, strides: np.ndarray) -> np.ndarray:
    """(N, 85) crua -> mesma forma com centro/tamanho (x, y, w, h) em pixels da entrada do modelo."""
    out = raw.astype(np.float32, copy=True)
    out[:, :2] = (out[:, :2] + grids) * strides
    out[:, 2:4] = np.exp(out[:, 2:4]) * strides
    return out


def postprocess(
    decoded: np.ndarray, ratio: float, confidence: float, nms_iou: float, image_size: tuple[int, int]
) -> list[Detection]:
    """Filtra a classe "pessoa", aplica NMS e devolve as caixas nas coordenadas da imagem ORIGINAL."""
    scores = decoded[:, 4] * decoded[:, 5 + PERSON_CLASS]
    mask = scores >= confidence
    if not np.any(mask):
        return []
    boxes_c, kept_scores = decoded[mask, :4], scores[mask]
    x1 = (boxes_c[:, 0] - boxes_c[:, 2] / 2) / ratio
    y1 = (boxes_c[:, 1] - boxes_c[:, 3] / 2) / ratio
    x2 = (boxes_c[:, 0] + boxes_c[:, 2] / 2) / ratio
    y2 = (boxes_c[:, 1] + boxes_c[:, 3] / 2) / ratio
    rects = [[float(a), float(b), float(c - a), float(d - b)] for a, b, c, d in zip(x1, y1, x2, y2)]
    keep = cv2.dnn.NMSBoxes(rects, [float(s) for s in kept_scores], score_threshold=confidence, nms_threshold=nms_iou)
    height, width = image_size
    detections: list[Detection] = []
    for i in np.asarray(keep).reshape(-1):
        box = BBox(float(x1[i]), float(y1[i]), float(x2[i]), float(y2[i])).clipped(width, height)
        if box.area > 1.0:
            detections.append(Detection(box, float(kept_scores[i])))
    detections.sort(key=lambda d: -d.confidence)
    return detections


class YoloxOnnxDetector:
    """Detecta pessoas com um modelo YOLOX em ONNX (qualquer tamanho: nano, tiny, s, m...)."""

    def __init__(
        self,
        weights: str | Path | None = None,
        *,
        input_size: tuple[int, int] | None = None,
        confidence: float = 0.3,
        nms_iou: float = 0.45,
        session: _Session | None = None,
        threads: int | None = None,
    ) -> None:
        if session is None:
            if weights is None:
                raise DetectorError("O detector yolox-onnx precisa do arquivo de pesos: informe --weights caminho/do/modelo.onnx.")
            path = Path(weights)
            if not path.is_file():
                raise DetectorError(f"Arquivo de pesos não encontrado: {path}. Veja o README (seção Modelo e licenças).")
            try:
                import onnxruntime as ort

                options = ort.SessionOptions()
                if threads:
                    options.intra_op_num_threads = threads
                session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
            except Exception as error:  # onnxruntime lança tipos próprios
                raise DetectorError(f"Não foi possível carregar o modelo ONNX {path.name}: {error}") from error
        self._session = session
        model_input = session.get_inputs()[0]
        shape = list(model_input.shape)
        if input_size is None:
            if len(shape) == 4 and all(isinstance(d, int) for d in shape[2:]):
                input_size = (int(shape[2]), int(shape[3]))
            else:
                input_size = (640, 640)
        if input_size[0] % 32 or input_size[1] % 32:
            raise DetectorError(f"Tamanho de entrada inválido {input_size}: precisa ser múltiplo de 32.")
        self._input_name = model_input.name
        self._input_size = input_size
        self._confidence = confidence
        self._nms_iou = nms_iou
        self._grids, self._strides = build_grids(input_size)
        self.info = DetectorInfo(
            name="yolox-onnx",
            version=Path(weights).name if weights else "sessao-injetada",
            code_license="Apache-2.0 (YOLOX, Megvii-BaseDetection)",
            weights_license="NÃO declarada separadamente: o repositório do YOLOX (Apache-2.0) distribui os pesos sem licença própria, treinados no COCO. Confirmar com o Megvii antes de uso comercial.",
            confidence_semantics="objectness x probabilidade da classe pessoa, em 0..1; não é calibrada para o ginásio do Alpha7",
            notes=f"entrada {input_size[0]}x{input_size[1]}, CPU (onnxruntime)",
        )

    def detect(self, image_bgr: np.ndarray) -> list[Detection]:
        tensor, ratio = letterbox(image_bgr, self._input_size)
        try:
            outputs = self._session.run(None, {self._input_name: tensor})
        except Exception as error:
            raise DetectorError(f"A inferência do YOLOX falhou: {error}") from error
        raw = np.asarray(outputs[0])
        if raw.ndim != 3 or raw.shape[0] != 1 or raw.shape[2] != OUTPUT_WIDTH or raw.shape[1] != self._grids.shape[0]:
            raise DetectorError(
                f"Saída do modelo inesperada {tuple(raw.shape)}: esperado (1, {self._grids.shape[0]}, {OUTPUT_WIDTH}). "
                "O arquivo precisa ser um YOLOX exportado em ONNX com a cabeça \"crua\" (sem decodificação embutida) e 80 classes do COCO."
            )
        decoded = decode_outputs(raw[0], self._grids, self._strides)
        return postprocess(decoded, ratio, self._confidence, self._nms_iou, image_bgr.shape[:2])

    def close(self) -> None:
        self._session = None  # type: ignore[assignment]
