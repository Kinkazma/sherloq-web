"""Reproduce the separate public30MP fixture from the entire pinned rich96MP JPEG.

Requires existing NumPy/OpenCV. Never runs a model, installs dependencies,
overwrites fixtures, or writes to source/reference/runtime/model directories.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sys
import time

MANIFEST_SHA = 'bc311beb64509716f917dabfe3fb0f0ff603c8efef747ff97fadde7732dcb6a1'
JPEG_SHA = '03c0b3127e021f2b8f88cbe044545e0de2127fcdae8a62cd36182821180f2ccb'
RGB_SHA = 'f36a71d7001d402be0f2615fdda70a01964b78f723660ee312cb4986d227a17b'
DERIVED_JPEG_SHA = '693a7ce49c894e97326aeb62399629b1cfb41c7eccc85d2cf7c8e27dfaa2ffc9'
DERIVED_RGB_SHA = '461c7c8d2524be737679f14da3ccd8da071e8746413fda920334a1cb8d11d83c'
WIDTH, HEIGHT = 7500, 4000
PROTECTED_COMPONENTS = {
    '.git', 'node_modules', 'src', 'vendor', 'experiments', 'assets', 'chunks',
    'models', 'parameters', 'd2prl-private-package', 'd2prl-model-zones',
    'neural-segmented', 'segmentation-models', 'unified-assets',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rgb_sha(bgr, np):
    digest = hashlib.sha256()
    for y in range(0, bgr.shape[0], 64):
        digest.update(np.ascontiguousarray(bgr[y:y + 64, :, ::-1]).tobytes())
    return digest.hexdigest()


def validate_output(source, reference, output):
    require(source.is_file() and reference.is_file(), 'Existing source JPEG and reference JSON required')
    require(source.stat().st_size == 22835139 and reference.stat().st_size == 5436,
            'Pinned96MP JPEG/reference sizes required before reading any input payload')
    require(not output.exists() and not output.is_symlink(), 'Output directory must be new; never overwrite a fixture')
    for protected in (source.parent, reference.parent):
        require(not output.is_relative_to(protected) and not protected.is_relative_to(output),
                'Output must be separate from source/reference roots')
    require(not PROTECTED_COMPONENTS.intersection(output.parts),
            'Output must not be inside runtime, model, parameter, asset or chunk directories')


def generate(args):
    source_file = Path(args.source).expanduser().resolve()
    manifest_file = Path(args.source_reference).expanduser().resolve()
    output = Path(args.output_dir).expanduser().resolve()
    validate_output(source_file, manifest_file, output)
    manifest_bytes = manifest_file.read_bytes()
    require(sha(manifest_bytes) == MANIFEST_SHA, 'Pinned rich96MP manifest SHA differs')
    native = json.loads(manifest_bytes)
    require(native.get('variant') == 'd2prl' and [native.get('width'), native.get('height')] == [12000, 8000],
            'Pinned D2PRL96MP source geometry required')
    require(native.get('original', {}).get('sha256') == JPEG_SHA
            and native['original'].get('bytes') == 22835139 and native.get('pixelSha256') == RGB_SHA,
            'Pinned original/decoded96MP identities differ')
    source_bytes = source_file.read_bytes()
    require(len(source_bytes) == 22835139 and sha(source_bytes) == JPEG_SHA, 'Pinned96MP JPEG bytes differ')

    # Imported only for actual generation, so --help does no codec/image work.
    import cv2 as cv
    import numpy as np

    require(hasattr(cv, 'IMWRITE_JPEG_SAMPLING_FACTOR') and hasattr(cv, 'IMWRITE_JPEG_SAMPLING_FACTOR_420'),
            'Existing OpenCV with explicit JPEG4:2:0 encoding support required; no dependencies are installed')
    cv.setNumThreads(1)
    cv.ocl.setUseOpenCL(False)
    started = time.monotonic()
    decode_flags = cv.IMREAD_COLOR | cv.IMREAD_IGNORE_ORIENTATION
    source_bgr = cv.imdecode(np.frombuffer(source_bytes, np.uint8), decode_flags)
    require(source_bgr is not None and source_bgr.shape == (8000, 12000, 3), 'Decoded96MP geometry differs')
    decoded_source_sha = rgb_sha(source_bgr, np)
    require(decoded_source_sha == RGB_SHA, 'Existing codec does not reproduce the pinned96MP RGB')
    print('Pinned96MP JPEG and all decoded source RGB verified', flush=True)
    resized = cv.resize(source_bgr, (WIDTH, HEIGHT), interpolation=cv.INTER_AREA)
    require(resized.shape == (HEIGHT, WIDTH, 3), 'Complete30MP resize geometry differs')
    resized_rgb_sha = rgb_sha(resized, np)
    del source_bgr, source_bytes
    parameters = [
        cv.IMWRITE_JPEG_QUALITY, 93,
        cv.IMWRITE_JPEG_PROGRESSIVE, 0,
        cv.IMWRITE_JPEG_OPTIMIZE, 0,
        cv.IMWRITE_JPEG_RST_INTERVAL, 0,
        cv.IMWRITE_JPEG_SAMPLING_FACTOR, cv.IMWRITE_JPEG_SAMPLING_FACTOR_420,
    ]
    ok, encoded = cv.imencode('.jpg', resized, parameters)
    require(ok, 'JPEG encoding failed')
    del resized
    encoded_bytes = encoded.tobytes()
    decoded = cv.imdecode(encoded, decode_flags)
    require(decoded is not None and decoded.shape == (HEIGHT, WIDTH, 3), 'Decoded30MP geometry differs')
    pixel_sha = rgb_sha(decoded, np)
    del decoded, encoded
    require(sha(encoded_bytes) == DERIVED_JPEG_SHA and pixel_sha == DERIVED_RGB_SHA,
            'Codec/interpolation output differs from the qualified30MP fixture; expected OpenCV4.12.0, NumPy1.26.4, libjpeg-turbo3.1.0-70. Nothing is written.')
    record = dict(
        schema=1, variant='d2prl', width=WIDTH, height=HEIGHT, pixels=WIDTH * HEIGHT,
        mode='whole-image',
        original=dict(file='source.jpg', bytes=len(encoded_bytes), sha256=sha(encoded_bytes)),
        pixelSha256=pixel_sha, decodedRgbBytes=WIDTH * HEIGHT * 3, orientation=1,
        zones=[dict(id='full-envelope', kind='envelope', bounds=[0, 0, WIDTH, HEIGHT])],
        exclusions=[], expectedInferences=1,
        provenance=dict(
            sourceManifest=dict(file=str(manifest_file), sha256=MANIFEST_SHA),
            sourceOriginal=dict(file=str(source_file), bytes=22835139, sha256=JPEG_SHA,
                                width=12000, height=8000, orientation=1),
            sourcePixelSha256=decoded_source_sha,
            resizedRgbSha256BeforeJpeg=resized_rgb_sha,
            transformation='Entire decoded96MP source resized to7500x4000; no crop, pixel substitution or model-derived image',
        ),
        recipe=dict(
            python=platform.python_version(), executable=sys.executable,
            numpy=np.__version__, opencv=cv.__version__,
            jpegBuild=[line.strip() for line in cv.getBuildInformation().splitlines() if line.strip().startswith('JPEG:')],
            decoder='cv2.imdecode uint8 BGR; RGB digests in row-major channel order,64-row bounded hash windows',
            decodeFlags=dict(IMREAD_COLOR=int(cv.IMREAD_COLOR), IMREAD_IGNORE_ORIENTATION=int(cv.IMREAD_IGNORE_ORIENTATION)),
            interpolation=dict(name='cv2.INTER_AREA', value=int(cv.INTER_AREA)),
            jpeg=dict(quality=93, progressive=False, optimize=False, restartInterval=0,
                      sampling='4:2:0', samplingValue=int(cv.IMWRITE_JPEG_SAMPLING_FACTOR_420),
                      parameterVector=list(map(int, parameters))),
            opencvThreads=cv.getNumThreads(), opencl=False,
            generator=dict(file=Path(__file__).name, sha256=sha(Path(__file__).read_bytes())),
        ),
        oracle=dict(status='not-generated', modelInferencesPerformed=0, expectedPlanesPresent=False),
        scope='New separate30MP public source fixture for actual common-engine whole-envelope inference and full30MP projection. Existing96MP corpus/model/runtime untouched; no model output or performance claim.',
        generationSeconds=time.monotonic() - started,
    )
    # Recheck immediately before one exclusive directory creation. Only files
    # created by this invocation are eligible for cleanup after a write failure.
    validate_output(source_file, manifest_file, output)
    output.mkdir(parents=True, exist_ok=False)
    created = []
    try:
        jpeg_file = output / 'source.jpg'
        with jpeg_file.open('xb') as stream:
            created.append(jpeg_file)
            stream.write(encoded_bytes)
        reference_file = output / 'reference.json'
        with reference_file.open('x', encoding='utf-8') as stream:
            created.append(reference_file)
            stream.write(json.dumps(record, indent=2) + '\n')
    except BaseException:
        for file in reversed(created):
            file.unlink(missing_ok=True)
        try:
            output.rmdir()
        except OSError:
            pass
        raise
    return dict(status='source-fixture-generated-no-model-inference', directory=str(output),
                original=record['original'], pixelSha256=pixel_sha, dimensions=[WIDTH, HEIGHT],
                decodedRgbBytes=record['decodedRgbBytes'], generationSeconds=record['generationSeconds'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, help='Existing rich96MP JPEG; exact pinned03c0... bytes required')
    parser.add_argument('--source-reference', required=True, help='Existing96MP native manifest; exact bc311... SHA required')
    parser.add_argument('--output-dir', required=True, help='New separate directory outside source/reference/runtime/model roots')
    args = parser.parse_args()
    try:
        result = generate(args)
    except Exception as error:
        print(json.dumps(dict(status='rejected', error=dict(type=type(error).__name__, message=str(error)))), file=sys.stderr)
        return 1
    print(json.dumps(result), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
