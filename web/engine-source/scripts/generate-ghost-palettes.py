from pathlib import Path
import json,matplotlib,numpy as np
assert matplotlib.__version__ == '3.8.4', 'Pinned native Matplotlib 3.8.4 required'
root=Path(__file__).resolve().parents[1];palettes={name:matplotlib.colormaps[name](np.arange(256),bytes=True)[:,:3].ravel().tolist() for name in ['gray','viridis']}
(root/'src/ghost-palettes.js').write_text('// Matplotlib '+matplotlib.__version__+' scalar-to-RGB byte lookups; generated synthetic reference.\nexport const GHOST_PALETTES=Object.freeze('+json.dumps(palettes,separators=(',',':'))+');\n')
