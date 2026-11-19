"""Contrato dos detectores de pessoas. Trocar de modelo = implementar `PersonDetector` e registrar em `registry.py`."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np

from ..types import Detection


@dataclass(frozen=True)
class DetectorInfo:
    """Metadados que vão para o JSON de saída: de onde veio cada detecção e sob qual licença."""

    name: str
    version: str
    code_license: str
    weights_license: str
    #: Como interpretar o campo `confidence` deste detector (não é uma probabilidade calibrada em todos).
    confidence_semantics: str
    notes: str = ""


@runtime_checkable
class PersonDetector(Protocol):
    """Recebe um quadro BGR (como o OpenCV entrega) e devolve pessoas em coordenadas DESSE quadro."""

    info: DetectorInfo

    def detect(self, image_bgr: np.ndarray) -> list[Detection]: ...

    def close(self) -> None: ...
