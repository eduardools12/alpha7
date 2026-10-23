"""Aparência por cor, usada SÓ para ajudar o rastreador a não trocar trilhas entre pessoas próximas.

Não é reconhecimento de identidade: é um histograma HSV do tronco de cada caixa, comparado entre quadros. Uniformes
parecidos, pouca luz ou a bola na frente reduzem muito a utilidade, e o rastreador nunca decide só por aparência.
"""

from __future__ import annotations

import cv2
import numpy as np

from .types import BBox

_BINS = (8, 3, 4)  # matiz, saturação, valor


def torso_histogram(image_bgr: np.ndarray, bbox: BBox) -> np.ndarray | None:
    """Histograma HSV normalizado da região do tronco (miolo da caixa, sem cabeça nem pernas). None se a região for pequena demais."""
    height, width = image_bgr.shape[:2]
    x1, x2 = bbox.x1 + 0.2 * bbox.width, bbox.x2 - 0.2 * bbox.width
    y1, y2 = bbox.y1 + 0.15 * bbox.height, bbox.y1 + 0.55 * bbox.height
    ix1, iy1 = max(0, int(round(x1))), max(0, int(round(y1)))
    ix2, iy2 = min(width, int(round(x2))), min(height, int(round(y2)))
    if ix2 - ix1 < 4 or iy2 - iy1 < 6:
        return None
    hsv = cv2.cvtColor(image_bgr[iy1:iy2, ix1:ix2], cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, list(_BINS), [0, 180, 0, 256, 0, 256])
    total = float(hist.sum())
    if total <= 0:
        return None
    return (hist / total).astype(np.float32).reshape(-1)


def similarity(a: np.ndarray | None, b: np.ndarray | None) -> float:
    """0 (diferentes) a 1 (iguais). Sem histograma de um dos lados devolve 0,5 (neutro: não ajuda nem atrapalha)."""
    if a is None or b is None:
        return 0.5
    distance = float(cv2.compareHist(a, b, cv2.HISTCMP_BHATTACHARYYA))
    return max(0.0, min(1.0, 1.0 - distance))


def blend(old: np.ndarray | None, new: np.ndarray | None, weight: float = 0.2) -> np.ndarray | None:
    """Média móvel do histograma da trilha (a roupa não muda, mas a luz e a pose sim)."""
    if new is None:
        return old
    if old is None:
        return new
    mixed = (1.0 - weight) * old + weight * new
    return (mixed / max(float(mixed.sum()), 1e-9)).astype(np.float32)
