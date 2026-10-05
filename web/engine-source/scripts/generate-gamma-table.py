"""Freeze the native scalar power rounding for the finite 50-position slider."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'source'))
from gui.sherloq_app.core.adjust import adjustment_lut
rows=[','.join(map(str,adjustment_lut(g,0,0,0,255))) for g in range(1,51)]
(root/'web-engine/native/gamma-lut.h').write_text('// Native adjustment_lut: all 50 supported gamma tenths, no other tone adjustment.\nstatic const unsigned char gammaLut[50][256]={\n'+',\n'.join('{'+r+'}' for r in rows)+'\n};\n')
