# Native PNG loading

The controlled OpenCV loader now accepts every standard PNG colour/depth pairing:
gray1/2/4/8/16 bits, palette1/2/4/8 bits, RGB8/16, gray+alpha8/16 and RGBA8/16.
Both non-interlaced and Adam7 inputs are accepted. EXIF orientations1–8 are applied
by the native decoder; header dimensions and returned RGB dimensions agree.
`imageHeader` also returns `compressionMethod`, `filterMethod` and `interlace`.
Unsupported coding methods or illegal colour/depth pairs fail explicitly before
decoding. No source bytes or palette entries are rewritten.

`load` and `loadBlob` keep the same API. Analysis pixels remain RGB8. Source depth,
orientation, ICC presence and alpha policy are retained in decode provenance.
Alpha/tRNS is handled by native IMREAD_COLOR and not retained; ICC is not applied.
This opens palette/packed inputs that the previous inspector rejected. `loadBlob`
now also has the bounded static-PNG row/storage fallback in [PNG-STREAM.md](PNG-STREAM.md);
the contiguous path keeps its existing admission and first-frame policy.

The unchanged native file loader supplies32 generated reference PNGs: packed
gray/palette, transparency, Adam7,8/16-bit colour/alpha and all PNG EXIF orientations,
including a1×1 interlaced palette file. Native RGB hashes and dimensions are exact
through both engine load paths and a real Chrome154 worker. The21 existing
PNG/TIFF cases still pass, including their four expected native TIFF orientation
refusals. Five invalid PNG header configurations are rejected before decode.
Generator and fixtures are local to M5's own tests/data; shared fixtures were read
only. No general OpenCV binary change or browser calibration was necessary.

B can keep accepting `image/png` and display the additional source depths/types
from provenance/header data. TIFF5–8 orientation refusals, other unsupported TIFF
variants, CMYK JPEG, RAW and segmented TIFF remain separate work.

## PNG eXIf metadata

The parsed eXIf TIFF object is retained in `metadata.structure.data.exif`, using the
same numeric directories/entry offsets as JPEG EXIF. `metadata.location` exposes
supported GPS rationals from that object; `metadata.thumbnail` extracts the embedded
JPEG, resizes and computes its difference using the existing native method. Absolute
byte offsets refer to the original PNG, including eXIf located after IDAT. Multiple
eXIf chunks are rejected as ambiguous. No ExifTool-complete dump, CRC verification,
composite GPS/XMP extraction or C2PA validation is implied.

Two synthetic PNGs preserve the same EXIF before and after IDAT. Pillow independently
reads GPS and the unchanged native thumbnail function produces the resize/difference
references. Node and real Chrome worker compare source thumbnail bytes, offsets,
coordinates, three directories and both raster hashes exactly. Malformed offsets and
duplicate eXIf reject explicitly; the32 PNG format cases and existing JPEG metadata
case still pass. Fixtures/generator are owned by this worktree under tests/data and
scripts/generate-png-exif-reference.py.
