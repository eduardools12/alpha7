"""Criação de detectores por nome. Para adicionar um modelo novo: implemente `PersonDetector` e inclua aqui."""

from __future__ import annotations

from pathlib import Path

from ..errors import DetectorError
from .base import PersonDetector
from .hog import HogDetector
from .yolox_onnx import YoloxOnnxDetector

DETECTOR_NAMES = ("hog", "yolox-onnx")


def create_detector(name: str, *, weights: str | Path | None = None, confidence: float = 0.3, threads: int | None = None) -> PersonDetector:
    if name == "hog":
        return HogDetector()
    if name == "yolox-onnx":
        return YoloxOnnxDetector(weights, confidence=confidence, threads=threads)
    raise DetectorError(f"Detector desconhecido: {name!r}. Opções: {', '.join(DETECTOR_NAMES)}.")
