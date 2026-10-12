#!/usr/bin/env python3
"""Independent SciPy reference for the SSG/Bessel-Fourier numerical core.

This does not execute MATLAB, detect SIFT points, or claim full-detector parity.
The formula uses scipy.special.jv/jn_zeros and NumPy tensor contraction rather
than the JavaScript Bessel series. Synthetic patches contain no user image.
"""
import json
from pathlib import Path
import numpy as np
import scipy
from scipy.special import jv, jn_zeros


def basis(size=20, radii=30, angles=36):
    # Match the published author's row/column convention for reproducibility.
    col, row = np.meshgrid(np.arange(size), np.arange(size))
    x, y = row - (size - 1) / 2, col - (size - 1) / 2
    roots = jn_zeros(1, 5)
    result = np.zeros((size, size, 16), dtype=np.complex128)
    for theta in np.arange(angles) * 2 * np.pi / angles:
        phase = np.exp(1j * np.repeat(np.arange(4), 4) * theta)
        for radius in np.linspace(0, (size - 1) / 2, radii):
            rho = 2 * radius / size
            interpolation = np.maximum(0, 1 - abs(x - radius * np.cos(theta))) * np.maximum(0, 1 - abs(y - radius * np.sin(theta)))
            radial = jv(1, rho * roots[1:]) * rho / (np.pi * jv(2, roots[1:]) ** 2)
            result += interpolation[..., None] * np.tile(radial, 4) * phase
    normalization = np.sqrt(np.square(abs(result[..., 0])).sum())
    result *= np.tile([1, 2, 2, 2], 4) / normalization
    return result


def describe(patch, kernels):
    moments = np.einsum('ij,ijd->d', patch, kernels)
    raw = moments[4:].reshape(3, 4)
    invariants = raw * np.conj(np.roll(raw, -1, axis=1))
    complex_pairs = lambda values: np.stack([values.real, values.imag], axis=-1).ravel().tolist()
    return dict(magnitudes=abs(moments[:4]).tolist(), invariants=complex_pairs(invariants), moments=complex_pairs(raw))


def main():
    kernels = basis()
    y, x = np.indices((20, 20))
    patches = [np.zeros((20, 20)), np.ones((20, 20)) * 127, ((17 * x + 23 * y + x * y * 3) % 256).astype(float), ((x == 6) & (y == 9)).astype(float) * 255]
    cases = [dict(name=name, patch=patch.ravel().tolist(), expected=describe(patch, kernels)) for name, patch in zip(['zero', 'constant', 'synthetic-texture', 'impulse'], patches)]
    positions = [(0, 0), (4, 6), (9, 10), (18, 3), (19, 19)]
    coefficients = [dict(position=list(pos), real=kernels[pos].real.tolist(), imag=kernels[pos].imag.tolist()) for pos in positions]
    output = dict(reference='independent SciPy formulas; not MATLAB whole-detector parity', scipy=scipy.__version__, roots=jn_zeros(1, 5).tolist(), basis=coefficients, cases=cases)
    destination = Path(__file__).resolve().parents[1] / 'tests/ssg-moments.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2) + '\n')
    print(destination)


if __name__ == '__main__':
    main()
