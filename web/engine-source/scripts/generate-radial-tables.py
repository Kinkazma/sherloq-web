"""Freeze fixed-angle libm constants from the ARM macOS native reference.
No image, tuning, benchmark, or runtime calibration participates in this table.
Run on the native reference host; generated hexadecimal floats are portable.
"""
import ctypes,struct,platform
assert platform.system()=='Darwin' and platform.machine()=='arm64', 'Native ARM Darwin libm required.'
from pathlib import Path
f32=lambda x:struct.unpack('f',struct.pack('f',x))[0]
tanf=ctypes.CDLL(None).tanf;tanf.restype=ctypes.c_float;tanf.argtypes=[ctypes.c_float]
values=[float(tanf(f32(f32(k*f32(3.14159))/180))).hex()+'f'for k in range(180)]
(Path(__file__).resolve().parents[1]/'native/radial-tables.h').write_text('// Fixed 180-angle native Darwin libm tanf values; see scripts/generate-radial-tables.py.\nstatic constexpr float nativeRadialTangents[180]={\n'+',\n'.join(' '+','.join(values[i:i+6])for i in range(0,180,6))+'\n};\n')
