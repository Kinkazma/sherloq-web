"""Offline codec experiment, never a runtime capacity/calibration probe.

Encode the same SDR TIFF as sRGB8, sRGB10 and BT.2020 PQ10 (SDR white
at 203 cd/m²). Decode each with dav1d, invert the colour transforms, and
measure errors against the original in the SAME sRGB domain. No gain map.
Requires numpy, Pillow, OpenCV, libavif's avifenc and avifdec.
"""
import argparse
import hashlib
import json
import math
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageCms


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, check=True)
    return result.stdout + result.stderr


def rgb_xyz(primaries):
    columns = np.array([[x / y, 1, (1-x-y) / y] for x, y in primaries]).T
    white = np.array([.3127/.3290, 1, (1-.3127-.3290)/.3290])
    return columns @ np.diag(np.linalg.solve(columns, white))


M709 = rgb_xyz([(.64, .33), (.30, .60), (.15, .06)])
M2020 = rgb_xyz([(.708, .292), (.170, .797), (.131, .046)])
TO2020 = np.linalg.solve(M2020, M709)
TO709 = np.linalg.inv(TO2020)
M1, M2, C1, C2, C3 = 2610/16384, 2523/32, 3424/4096, 2413/128, 2392/128


def linear_srgb(rgb):
    return np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)


def nonlinear_srgb(rgb):
    return np.where(rgb <= .0031308, 12.92*rgb,
                    1.055*np.maximum(rgb, 0)**(1/2.4)-.055)


def to_pq(rgb, white):
    linear2020 = linear_srgb(rgb) @ TO2020.T
    p = np.maximum(linear2020 * white/10000, 0)**M1
    return ((C1+C2*p)/(1+C3*p))**M2


def from_pq(rgb, white):
    p = np.maximum(rgb, 0)**(1/M2)
    nits = 10000*(np.maximum(p-C1, 0)/(C2-C3*p))**(1/M1)
    return nonlinear_srgb((nits/white) @ TO709.T)


def write_png16(path, rgb):
    pixels = np.round(np.clip(rgb, 0, 1)*65535).astype(np.uint16)
    assert cv2.imwrite(str(path), pixels[..., ::-1])


def metrics(reference, decoded):
    delta = (decoded-reference)*255
    mse = float(np.mean(delta**2))
    absolute = np.abs(delta)
    return dict(psnrSrgbDb=10*math.log10(255**2/mse) if mse else None,
                meanAbsoluteSrgb8=float(absolute.mean()),
                p95AbsoluteSrgb8=float(np.quantile(absolute, .95)),
                maximumAbsoluteSrgb8=float(absolute.max()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--qualities', default='90')
    parser.add_argument('--chroma', choices=['422', '444', '420'], default='422')
    parser.add_argument('--white', type=float, default=203)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    qualities = [int(value) for value in args.qualities.split(',')]
    assert all(0 <= q <= 100 for q in qualities)
    with Image.open(args.input) as image:
        assert image.format == 'TIFF', 'A TIFF source is required'
        profile = image.info.get('icc_profile')
        if profile:
            import io
            image = ImageCms.profileToProfile(image,
                ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                ImageCms.createProfile('sRGB'), outputMode='RGB')
        else:
            assert image.mode in ['RGB', 'RGBA', 'L'], 'Unprofiled source must be SDR RGB/gray'
            image = image.convert('RGB')
        reference = np.asarray(image).astype(np.float64)/255
        width, height = image.size
        # A single canonical lossless TIFF is the explicit input to all recipes.
        canonical = args.output/'source-sdr.tif'
        image.save(canonical, compression='tiff_deflate',
                   icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
    srgb_png = args.output/'input-srgb16.png'
    pq_png = args.output/'input-bt2020-pq16.png'
    write_png16(srgb_png, reference)
    write_png16(pq_png, to_pq(reference, args.white))
    # Algebraic test before any lossy encoding; rules out a wrong colour transform.
    roundtrip = float(np.max(np.abs(from_pq(to_pq(reference, args.white), args.white)-reference)))
    assert roundtrip < 1e-8, roundtrip
    proof = dict(source=str(args.input.resolve()), originalSha256=digest(args.input),
                 canonicalTiffSha256=digest(canonical), width=width, height=height,
                 sourceColourPolicy='ICC to sRGB' if profile else 'Unprofiled RGB TIFF interpreted as sRGB',
                 encoder=run(['avifenc', '--version']).strip(), decoder=run(['avifdec', '--version']).strip(),
                 colourTransformRoundtripMax=roundtrip, sdrWhiteNits=args.white, chroma=args.chroma,
                 scope='Offline comparison with libaom; does not reproduce unknown Photoshop settings. Equal quality numbers do not imply equal decoded quality.',
                 cases=[])
    recipes = [('sdr8', srgb_png, 8, '1/13/1'),
               ('sdr10', srgb_png, 10, '1/13/1'),
               ('hdr-pq10-sdr-content', pq_png, 10, '9/16/9')]
    for quality in qualities:
        for name, pixels, depth, cicp in recipes:
            stem = f'{name}-q{quality}-{args.chroma}'
            output = args.output/(stem+'.avif')
            command = ['avifenc', '--codec', 'aom', '--jobs', '4', '--speed', '6',
                       '--qcolor', str(quality), '--depth', str(depth), '--yuv', args.chroma,
                       '--range', 'full', '--cicp', cicp, '--advanced', 'tune=psnr',
                       '--ignore-exif', '--ignore-xmp', '--ignore-icc', str(pixels), str(output)]
            start = time.monotonic()
            log = run(command)
            elapsed = time.monotonic()-start
            (args.output/(stem+'-encode.log')).write_text(log)
            decoded_path = args.output/(stem+'-decoded.png')
            log = run(['avifdec', '--codec', 'dav1d', '--depth', '16', str(output), str(decoded_path)])
            (args.output/(stem+'-decode.log')).write_text(log)
            decoded_metadata = {line.split(':', 1)[0].strip(' *'): line.split(':', 1)[1].strip()
                                for line in log.splitlines() if ':' in line}
            assert decoded_metadata['Bit Depth'] == str(depth), log
            assert decoded_metadata['Format'] == 'YUV'+args.chroma, log
            for field, value in zip(['Color Primaries', 'Transfer Char.', 'Matrix Coeffs.'], cicp.split('/')):
                assert any(field in line and line.split(':')[-1].strip() == value for line in log.splitlines()), (field, log)
            assert decoded_metadata['Gain map'] == 'Absent', log
            decoded = cv2.imread(str(decoded_path), cv2.IMREAD_UNCHANGED)[..., ::-1].astype(np.float64)/65535
            assert decoded.shape == reference.shape
            if name.startswith('hdr'):
                decoded = from_pq(decoded, args.white)
            comparison = metrics(reference, decoded)
            Image.fromarray(np.round(np.clip(decoded,0,1)*255).astype(np.uint8)).save(args.output/(stem+'-sdr-view.png'))
            case = dict(name=name, quality=quality, bitDepth=depth, cicp=cicp,
                        file=output.name, bytes=output.stat().st_size, sha256=digest(output),
                        encodingSeconds=elapsed, command=command, gainMap=False, **comparison)
            proof['cases'].append(case)
            (args.output/'proof.json').write_text(json.dumps(proof, indent=2)+'\n')
            print(json.dumps(case), flush=True)


if __name__ == '__main__':
    main()
