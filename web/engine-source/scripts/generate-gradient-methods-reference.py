#!/usr/bin/env python3
"""Generate synthetic Krawetz references with independent NumPy/OpenCV code.

The algorithm is the empirical reconstruction of the 2009 Body By Victoria
example, not the unavailable original implementation. Python and Wasm libm may
differ by one RGB code at a truncation boundary; integer derivatives are exact.
"""
import json
from pathlib import Path

import cv2 as cv
import numpy as np


def reference(rgb, included=None, params=None):
    params = params or {}
    height, width = rgb.shape[:2]
    if included is None:
        included = np.ones((height, width), dtype=bool)
    values = rgb.astype(np.int32)
    gray = ((299 * values[..., 0] + 587 * values[..., 1] + 114 * values[..., 2]) // 1000).astype(float)
    slopes = np.zeros((height, width, 2), dtype=np.int16)
    # Vectorized shifted intersections, independently of the compiled kernel.
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            if not (ox or oy):
                continue
            yc = slice(max(0, -oy), min(height, height - oy))
            xc = slice(max(0, -ox), min(width, width - ox))
            yn = slice(max(0, oy), min(height, height + oy))
            xn = slice(max(0, ox), min(width, width + ox))
            admitted = included[yc, xc] & included[yn, xn]
            difference = np.where(admitted, gray[yn, xn] - gray[yc, xc], 0) * (4 if ox and oy else 7)
            slopes[yc, xc, 0] += (ox * difference).astype(np.int16)
            slopes[yc, xc, 1] += (oy * difference).astype(np.int16)
    dx = slopes[..., 0].astype(float)
    dy = slopes[..., 1].astype(float)
    if params.get('invert', False):
        dx = -dx
        dy = -dy
    angle = np.arctan2(dx, dy)
    magnitude = np.hypot(dx, dy)
    result = np.stack(((-np.cos(angle) / 2 + .5) * 255,
                       (-np.sin(angle) / 2 + .5) * 255,
                       np.minimum(magnitude / 9, 255)), axis=2).clip(0, 255).astype(np.uint8)
    result[magnitude == 0, :2] = 127
    # Presentation is reduced over the admitted union only.
    if params.get('equalize', False):
        for channel in range(3):
            plane = result[..., channel]
            plane[included] = cv.equalizeHist(plane[included].reshape(-1, 1)).ravel()
    else:
        intensity = int(params.get('intensity', 0) / 100 * 127)
        if intensity:
            lut = np.clip((np.arange(256) * -255 + intensity * 255) / (2 * intensity - 255), 0, 255).astype(np.uint8)
            result = lut[result]
    result[~included] = rgb[~included]
    return slopes, result


def main():
    cases = []
    for name, width, height in [('single', 1, 1), ('row', 17, 1), ('column', 1, 19),
                                ('texture', 41, 37), ('flat', 11, 9), ('edge', 19, 17), ('masked', 23, 21)]:
        ids = np.arange(width * height * 3)
        rgb = ((ids * 73 + (ids // 7) * 19) % 256).astype(np.uint8).reshape(height, width, 3)
        if name == 'flat':
            rgb.fill(120)
        if name == 'edge':
            rgb.fill(0)
            rgb[:, width // 2:] = 255
        included = np.ones((height, width), bool)
        if name == 'masked':
            included[:, 9:13] = False
            included[4:12, 3:7] = False
            included[16:, :4] = False
        slopes, output = reference(rgb, included)
        cases.append({'name': name, 'width': width, 'height': height,
                      'rgb': rgb.ravel().tolist(), 'membership': included.astype(np.uint8).ravel().tolist(),
                      'slopes': slopes.ravel().tolist(), 'output': output.ravel().tolist()})
    destination = Path(__file__).resolve().parents[1] / 'fixtures' / 'gradient-methods-reference.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({'schema': 'sherloq.gradient-methods-reference/1',
                                      'oracle': 'independent Python NumPy/OpenCV reconstruction',
                                      'integerDerivativeTolerance': 0, 'rgbCodeTolerance': 1, 'cases': cases}, separators=(',', ':')) + '\n')
    print(destination)


if __name__ == '__main__':
    main()
