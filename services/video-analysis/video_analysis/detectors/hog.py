"""Detector de pessoas HOG + SVM do OpenCV.

É a linha de base: não baixa nada, roda em CPU e tem licença do OpenCV (Apache-2.0). Foi treinado para pedestres em
pé, vistos de frente, então erra bastante com atletas agachados, saltando ou em posições laterais. Serve para validar
o fluxo (leitura, rastreamento, exportação) e como comparação; para análise real use o detector `yolox-onnx`.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from ..errors import DetectorError
from ..types import BBox, Detection
from .base import DetectorInfo


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value)) if value > -700 else 0.0


def suppress_overlaps(rects: list[list[int]], scores: list[float], iou: float) -> list[int]:
    """Supressão de não-máximos. `rects` em (x, y, largura, altura); `scores` em 0..1 (o NMSBoxes do OpenCV exige limiar >= 0)."""
    if not rects:
        return []
    keep = cv2.dnn.NMSBoxes(rects, scores, 0.0, iou)
    return [int(i) for i in np.asarray(keep).reshape(-1)]


class HogDetector:
    info = DetectorInfo(
        name="opencv-hog",
        version=cv2.__version__,
        code_license="Apache-2.0 (OpenCV 4.5+)",
        weights_license="Coeficientes do detector de pessoas padrão do OpenCV (acompanham o código, Apache-2.0)",
        confidence_semantics="sigmoide da margem do SVM; NÃO é probabilidade calibrada, só serve para ordenar",
        notes="Linha de base. Pedestres em pé e de frente; baixa precisão com atletas agachados, saltando ou de lado.",
    )

    def __init__(self, win_stride: tuple[int, int] = (8, 8), scale: float = 1.05, hit_threshold: float = 0.0, nms_iou: float = 0.4) -> None:
        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        self._win_stride = win_stride
        self._scale = scale
        self._hit_threshold = hit_threshold
        self._nms_iou = nms_iou

    def detect(self, image_bgr: np.ndarray) -> list[Detection]:
        try:
            boxes, weights = self._hog.detectMultiScale(image_bgr, winStride=self._win_stride, padding=(8, 8), scale=self._scale, hitThreshold=self._hit_threshold)
        except cv2.error as error:
            raise DetectorError(f"O detector HOG falhou: {error}") from error
        if len(boxes) == 0:
            return []
        rects = [[int(x), int(y), int(w), int(h)] for x, y, w, h in boxes]
        probabilities = [_sigmoid(float(w)) for w in np.asarray(weights).reshape(-1)]
        detections: list[Detection] = []
        for i in suppress_overlaps(rects, probabilities, self._nms_iou):
            x, y, w, h = rects[i]
            detections.append(Detection(BBox(float(x), float(y), float(x + w), float(y + h)), probabilities[i]))
        return detections

    def close(self) -> None:
        return None
