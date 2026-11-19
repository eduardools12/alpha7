"""Calibração MANUAL da quadra: quatro pontos da imagem que marcam um retângulo conhecido do chão.

Não há detecção automática de linhas nem suposição de que a imagem inteira seja a quadra. Quem calibra marca, em
pixels do vídeo ORIGINAL, os quatro cantos da região que quer medir (por exemplo, a meia quadra visível, 9 m x 9 m)
e informa o tamanho real dessa região. O resultado só converte posições da imagem para metros DESSA região plana.

Ordem dos pontos (como aparecem na imagem): topo-esquerda, topo-direita, base-direita, base-esquerda.
Coordenadas da quadra: x cresce para a direita (0 até `width_m`) e y cresce do topo da imagem para a base (0 até `length_m`).

Limite importante: a conversão vale para pontos NO CHÃO. O ponto usado para cada pessoa é o centro da borda inferior
da caixa, que só aproxima os pés quando a pessoa está em pé; durante um salto ou mergulho o resultado é impreciso.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .errors import CalibrationError

CALIBRATION_SCHEMA = "alpha7.court-calibration/1"
CORNER_ORDER = ("topo-esquerda", "topo-direita", "base-direita", "base-esquerda")


@dataclass(frozen=True)
class CourtCalibration:
    image_points: tuple[tuple[float, float], ...]  # 4 pontos, em pixels do vídeo original
    width_m: float
    length_m: float
    frame_size: tuple[int, int] | None = None  # (largura, altura) do vídeo em que os pontos foram marcados
    description: str = ""

    def __post_init__(self) -> None:
        if len(self.image_points) != 4:
            raise CalibrationError("A calibração precisa de exatamente 4 pontos (topo-esquerda, topo-direita, base-direita, base-esquerda).")
        if not (self.width_m > 0 and self.length_m > 0):
            raise CalibrationError("As medidas reais da região (width_m e length_m) precisam ser positivas.")
        points = np.array(self.image_points, dtype=np.float64)
        if not np.all(np.isfinite(points)):
            raise CalibrationError("Os pontos da calibração precisam ser números finitos.")
        if self.frame_size is not None:
            w, h = self.frame_size
            if np.any(points[:, 0] < -0.5) or np.any(points[:, 0] > w + 0.5) or np.any(points[:, 1] < -0.5) or np.any(points[:, 1] > h + 0.5):
                raise CalibrationError(f"Há pontos fora da imagem {w}x{h}. Marque os cantos em pixels do vídeo original.")
        if not _is_convex_quad(points):
            raise CalibrationError("Os quatro pontos não formam um quadrilátero convexo na ordem pedida (topo-esquerda, topo-direita, base-direita, base-esquerda).")

    @property
    def homography(self) -> np.ndarray:
        src = np.array(self.image_points, dtype=np.float32)
        dst = np.array([[0, 0], [self.width_m, 0], [self.width_m, self.length_m], [0, self.length_m]], dtype=np.float32)
        return cv2.getPerspectiveTransform(src, dst)

    def to_court(self, x: float, y: float) -> tuple[float, float]:
        """Posição da imagem (pixels) em metros dentro da região calibrada."""
        vector = self.homography @ np.array([x, y, 1.0])
        return float(vector[0] / vector[2]), float(vector[1] / vector[2])

    def contains(self, court_x: float, court_y: float, margin_m: float = 0.0) -> bool:
        return -margin_m <= court_x <= self.width_m + margin_m and -margin_m <= court_y <= self.length_m + margin_m

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": CALIBRATION_SCHEMA,
            "description": self.description,
            "frame_size": list(self.frame_size) if self.frame_size else None,
            "corner_order": list(CORNER_ORDER),
            "image_points": [list(p) for p in self.image_points],
            "region_size_m": {"width": self.width_m, "length": self.length_m},
        }


def _is_convex_quad(points: np.ndarray) -> bool:
    signs = []
    for i in range(4):
        a, b, c = points[i], points[(i + 1) % 4], points[(i + 2) % 4]
        cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cross) < 1e-6:
            return False
        signs.append(cross > 0)
    return all(signs) or not any(signs)


def load_calibration(path: str | Path, frame_size: tuple[int, int] | None = None) -> CourtCalibration:
    file = Path(path)
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise CalibrationError(f"Arquivo de calibração não encontrado: {file}") from error
    except (OSError, json.JSONDecodeError) as error:
        raise CalibrationError(f"Não foi possível ler a calibração {file.name}: {error}") from error
    if not isinstance(data, dict) or data.get("schema_version") != CALIBRATION_SCHEMA:
        raise CalibrationError(f"A calibração precisa ter schema_version {CALIBRATION_SCHEMA!r}.")
    try:
        points = tuple((float(p[0]), float(p[1])) for p in data["image_points"])
        size = data["region_size_m"]
        saved_size = data.get("frame_size")
        calibrated_for = (int(saved_size[0]), int(saved_size[1])) if saved_size else None
        calibration = CourtCalibration(points, float(size["width"]), float(size["length"]), calibrated_for or frame_size, str(data.get("description", "")))
    except (KeyError, TypeError, ValueError, IndexError) as error:
        raise CalibrationError(f"Calibração {file.name} com formato inválido: {error}") from error
    if frame_size is not None and calibration.frame_size is not None and tuple(calibration.frame_size) != tuple(frame_size):
        raise CalibrationError(
            f"A calibração foi marcada num vídeo {calibration.frame_size[0]}x{calibration.frame_size[1]} e este vídeo é "
            f"{frame_size[0]}x{frame_size[1]}. Refaça a marcação para este vídeo."
        )
    return calibration


def save_calibration(calibration: CourtCalibration, path: str | Path) -> None:
    Path(path).write_text(json.dumps(calibration.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def draw_calibration_overlay(image_bgr: np.ndarray, calibration: CourtCalibration) -> np.ndarray:
    """Desenha a região marcada e uma grade de 1 m projetada na imagem, para conferir a marcação a olho."""
    canvas = image_bgr.copy()
    inverse = np.linalg.inv(calibration.homography)

    def project(cx: float, cy: float) -> tuple[int, int]:
        v = inverse @ np.array([cx, cy, 1.0])
        return int(round(v[0] / v[2])), int(round(v[1] / v[2]))

    for i in range(1, int(calibration.width_m)):
        cv2.line(canvas, project(i, 0), project(i, calibration.length_m), (0, 215, 255), 1, cv2.LINE_AA)
    for j in range(1, int(calibration.length_m)):
        cv2.line(canvas, project(0, j), project(calibration.width_m, j), (0, 215, 255), 1, cv2.LINE_AA)
    polygon = np.array([[int(round(x)), int(round(y))] for x, y in calibration.image_points], dtype=np.int32)
    cv2.polylines(canvas, [polygon], True, (255, 200, 0), 2, cv2.LINE_AA)
    for label, (x, y) in zip(("1", "2", "3", "4"), polygon):
        cv2.circle(canvas, (int(x), int(y)), 6, (255, 200, 0), -1, cv2.LINE_AA)
        cv2.putText(canvas, label, (int(x) + 8, int(y) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    return canvas
