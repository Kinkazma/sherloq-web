"""Generate the pinned native libm 8x8 cosine fingerprint (build-time oracle only)."""
from pathlib import Path
import math,sys
assert sys.platform == 'darwin', 'This generator records the native macOS oracle, not host-independent libm'
out=Path(__file__).resolve().parents[1]/'native/zero-cosines.h'
rows=[[math.cos((2.0*k+1.0)*l*math.pi/16.0).hex() for l in range(8)] for k in range(8)]
out.write_text('// ZERO native-reference cosine table; portable IEEE754 constants.\nstatic const double zero_cosines[8][8]={\n'+',\n'.join('{'+','.join(row)+'}' for row in rows)+'\n};\n')
