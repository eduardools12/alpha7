"""Teste VISUAL/REAL: só roda se existir uma gravação real do Alpha7 e a variável ALPHA7_REAL_VIDEO apontar para ela.

Os demais testes usam vídeo sintético e provam o fluxo, não a qualidade da detecção. Este teste NÃO mede precisão
(não há anotação manual para comparar): confere apenas que a análise termina e gera um JSON válido. A inspeção da
qualidade é feita a olho, assistindo ao vídeo anotado.

    set ALPHA7_REAL_VIDEO=C:\\caminho\\gravacao.mp4   (e, opcionalmente, ALPHA7_REAL_WEIGHTS=modelo.onnx)
"""

import json
import os
from pathlib import Path

import pytest

from video_analysis.export import validate_result
from video_analysis.pipeline import AnalysisConfig, analyze_video

REAL = os.environ.get("ALPHA7_REAL_VIDEO")
WEIGHTS = os.environ.get("ALPHA7_REAL_WEIGHTS")

pytestmark = [
    pytest.mark.real_video,
    pytest.mark.skipif(not REAL or not Path(REAL).is_file(), reason="sem gravação real: defina ALPHA7_REAL_VIDEO"),
]


def test_gravacao_real_gera_json_valido(tmp_path: Path) -> None:
    config = AnalysisConfig(
        input_path=Path(str(REAL)),
        output_dir=tmp_path,
        detector="yolox-onnx" if WEIGHTS else "hog",
        weights=Path(WEIGHTS) if WEIGHTS else None,
        max_seconds=30.0,
    )
    outputs = analyze_video(config)
    data = json.loads(outputs.json_path.read_text(encoding="utf-8"))
    assert validate_result(data) == []
    assert data["summary"]["frames_processed"] > 0
    print("\n" + json.dumps(data["summary"], ensure_ascii=False, indent=1)[:800])
