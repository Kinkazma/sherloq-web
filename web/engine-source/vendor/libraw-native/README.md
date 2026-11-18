LibRaw 0.22.2, built as a native-sample decoder using Emscripten 4.0.15.
`PINNED.json` records the source archive, toolchain, Emscripten JPEG/zlib ports
and output identities. LibRaw is available under LGPL 2.1 or CDDL 1.0; its
copyright and both license texts are included, together with IJG and zlib notices.

To rebuild, obtain the official LibRaw source archive identified in the manifest,
verify its SHA-256, extract it, and run from the engine directory:

```sh
python3 scripts/build-native-libraw.py \
  --libraw-source /path/to/LibRaw-0.22.2 \
  --emscripten-root /path/to/emsdk/upstream/emscripten \
  --build-dir /path/to/build-objects \
  --output vendor/libraw-native
```

No restricted LibRaw demosaic packs are linked. The core is single-threaded
WebAssembly with SIMD permitted; the application owns worker admission, memory
maximum and cancellation. The RGB16 row interface avoids allocating an extra
full image via `dcraw_make_mem_image`. The native input buffer remains alive until
the decoder is closed. Optional raw sensor rows are independent of development.

Default development uses full-size AHD, camera white balance, linear transfer,
no automatic brightening, no denoise and no highlight reconstruction (unclip).
The output is explicitly **ProPhoto D65 linear**, with LibRaw's exact generated
ICC profile. It must not be relabelled as standard ProPhoto D50. Color-managed
display and model input are separate application adapters. The developed RGB16
bank is unsigned. The additive sensor-only producer unpacks without calling
`dcraw_process` and disables LibRaw's float-to-integer conversion before opening.
It preserves the decoded sensor grid as Uint16 or Float32, including negative and
out-of-range floating values. These are LibRaw unpack results, not a guarantee
that every camera decoder leaves encoded ADC codes untouched. Sensor coordinates
are not declared identical to developed RGB coordinates.

The sensor-only API is inactive in normal imports. A separately admitted metadata
owner is required before converting/cloning post-unpack calibration. Only an
absent or zero selected frame is currently admitted by this producer; ordinary
first-view image opening is unchanged. Raw-bit-depth metadata is distinguished
from storage type and LibRaw format codes. DNG calibration matrices, black
patterns, levels and geometry are reported without automatic normalization.

Embedded previews have a separate preview-only API and never feed scientific
RAW development. Their orientation is reported and must be applied by the
preview consumer.
