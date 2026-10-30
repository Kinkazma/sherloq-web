"""Reconstruct the bounded ZERO byte adapters with the same scalar/SIMD ABI."""
from pathlib import Path
import subprocess,sys
subprocess.run([sys.executable,str(Path(__file__).with_name('build-zero-kernels.py')),'--targets','stream'],check=True)
