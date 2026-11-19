import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from helpers import write_synthetic_video  # noqa: E402


@pytest.fixture(scope="session")
def synthetic_video(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Clipe sintético de 40 quadros a 10 fps (4 s), compartilhado entre os testes (só leitura)."""
    return write_synthetic_video(tmp_path_factory.mktemp("video") / "clipe_sintetico.avi")
