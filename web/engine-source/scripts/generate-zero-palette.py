from pathlib import Path
import sys,json,matplotlib
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
assert matplotlib.__version__ == '3.8.4'
from gui.sherloq_app.tools.jpeg.zero import palette
(ROOT/'web-engine/src/zero-palette.js').write_text('// Native ZERO legend; Matplotlib 3.8.4 tab20/tab20b/tab20c/Set3, RGB bytes.\nexport const ZERO_PALETTE=Object.freeze('+json.dumps(palette()[:,::-1].copy().ravel().tolist(),separators=(',',':'))+');\n')
