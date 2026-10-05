# M4 qualification of complete large-source paths

Sources are full-resolution originals, decoded in the browser. No benchmark or
canary is introduced in product execution. Development artifacts stay in `.build`.
Accounted memory peaks measure the shared budget, not operating-system RSS;
original Blobs remain browser-managed and are not claimed to occupy zero RAM.

## PCA — qualified12000×8000

Rich public JPEG noise, seed130014, native decoded and copied left6000×8000 to the
right half without resizing, recompressed quality90. Source SHA256:
`26b0892c49a53583fe01b15bc2407844a216f00bc14dd4a6faebbe9467c65c36`.
Generator and recipe: `scripts/generate-dense-96mp.py`, `.build/dense-96mp/recipe.json`.

Actual native `PcaEngine` generated references for projection(component1) and
cross-product(component2, inversion and equalization). Chrome dedicated worker,
256MiB shared budget, OPFS, same96MP JPEG decoded via libjpeg. Mean/eigenvectors/
eigenvalues have zero error; every RGB byte of both views matches the native
hash. The second view reuses the global basis. Full PNGs each288100808bytes are
read after source/result disposal; independent OpenCV decoding validates all
96million pixels of both against the native hashes. Final retained/cache/active
memory is zero. Peak accounted123381029B. End-to-end209.284s, including browser
load, both calculations, complete view reads, both encodings and page delivery.
Native reference generation was61.984s in a separate development process.
Concurrent dense qualification was active, so timings are observational.

`pca-96mp-proof.json` contains per-view timings, encoders, hashes and storage.
Reproduction: generate native reference, run `check-m4-96mp-browser.mjs pca`,
then `check-m4-96mp-pngs.py pca`. Small native PCA corpus already covers distance
and all components/options; it is not rerun. Global mean/covariance/normalization
and the1/3-channel projection stores are exercised at96MP by these two views.
This does not claim WordPress UI integration.

## Wavelet Threshold — qualified12000×8000

Same rich JPEG original and SHA as PCA. Actual native WaveletEngine reference:
db4/31%/level3/soft, then73%/level2/hard. Full symmetric-axis decomposition has
10levels; cache reused on the second setting. Both complete RGB hashes exactly
match native, as do independent OpenCV reads of both full PNG exports after
source, cache and result disposal. Each PNG is288100808B. Chrome256MiB/OPFS,
peak268244480B, final memory0. End-to-end619.732s; first setting457.459s, second
141.627s including view reading/encoding. Native reference37.20s, measured in a
separate development process. Concurrent dense/browser development was active.
10 useful strip workers admitted during decomposition,6 during the second
reconstruction; no startup probes. The59wavelet/five-threshold native corpus
is already acquired; this case covers the shared global-axis and external
coefficient memory path. It does not qualify Wavelet Blocking's distinct
median/noise-map path or a deployed UI. `wavelet-96mp-proof.json`.

## Dense PatchMatch Zernike — qualified12000×8000

Same rich copied JPEG as PCA, full-image global search, patch8, two iterations,
radius12000, minimum5, texture2, tolerance50, Similarity. Chrome1GiB budget,
source RGB in RAM and descriptors/fields in OPFS; peak958121721B, final0.
4508171852 comparisons, 34 nonempty groups and 6000 displayed pairs (explicit
user display limit), all with the known6000pixel translation. Matching reads
204909778944B of logical temporary data: paging has a measured cost. Analysis
1686.565s, cached-field refilter .3→.2 in258.910s. Complete journey2080.4535s.
Consultable full-resolution surface, changed display, then export after source,
engine and result release. NPZ1344926474B/47entries passes independent SHA,
all CRCs and NumPy reads. All96M targets are valid;95776227 are the exact known
6000pixel same-row copy. Five complete8000×12000 fields, points12000×7,
pairs6000×4, groups/models/provenance and both threshold counts are checked.
Large matching is verified against the known copy and full archive invariants,
not claimed bit-exact against a separate96MP native matcher. The acquired42
small native matching cases remain exact. CompactSIFT preparation is a distinct memory path; its completed large-source
qualification and shared-variant coverage are recorded below.
See `dense-96mp-proof.json` and `check-dense-96mp-reader.py`.

## Frequency Split — qualified12000×8000

Same rich JPEG. Global DFT, polar representation, mask smoothing and inverse
transform under256MiB, OPFS, peak227147776B, final0. Native settings15/5/37/3
then display-filter7; all8 fullRGB views and the96Mfloat32 mask exactly match
native hashes. Second setting reuses base, mask and analysis. Six fullPNG
exports plus full384MB maskNPZ delivered after sources/cache/results release;
independent readers check complete pixels, SHA/CRC and all mask values. Three
useful workers for transforms. End-to-end1660.101s under concurrent development,
including delivery of all exports; first setting1356.480s, second59.420s.
No extra execution in product. See `frequency-96mp-proof.json`.

## Wavelet Blocking — qualified12000×8000

Same rich copied JPEG. File grayscale decoded by native JPEG ISLOW, full-axis db8
and block8→16 using the cached detail. Both96MP RGB views and complete float64
noise fields exactly match native. Two PNGs and both NPZ noise exports reread
independently after source/cache/result disposal, CRC/SHA/full arrays validated.
Chrome256MiB, peak268435456B, final0,10useful workers. First533.176s, cached
second18.997s; complete journey857.602s under concurrent load.
See `blocking-96mp-proof.json` and `check-blocking-96mp-noise.py`.

## Stereo — qualified12000×8000 source,11808×8000 result

Rich repeated192pixel texture JPEG; every native disparity is nonzero. Period
search is exact and reused with global Farneback flow on the second view. No
independent tile flow is substituted. All94,464,000float32 values exported and
compared with native:11,252differ, maximum1.5914440155029297e-5pixel,
mean4.060412277067297e-11pixel. View2exact; view3has one RGB channel different
by1among283,392,000channels, independently verified after full PNG export.
This is a relative disparity visualization, no binary classification. CPU native
reference retained; not claimed bit-exact at96MP. Both PNGs and full flowNPZ
SHA/CRC/NumPy reads succeed after source/cache/result disposal. Chrome256MiB,
peak129439291B, final0; bounded native heap89128960B, scratchpeak7179264000B.
Flow logical I/O77.52GB read /37.96GB written. Complete journey1508.070s,
including delayed exports/cleanup under concurrent development. The earlier
failed hash assertions and measured difference remain documented separately.
See `stereo-96mp-proof.json`, `check-m4-96mp-field.py stereo`, and
`check-stereo-96mp-view.py`. Large external storage has real cost; native full
workspaces cannot fit a resident WASM heap at this resolution.

## Common PNG consumer

The raster exporter, scientific adapter imports, PNG codec, source/build recipe
and licenses are consumed unchanged from M5 integration `f18fe7d`. This is the
existing common lossless surface export, not an M4 PNG implementation. Merge
these shared files once, preserving the newer integration version if applicable.

## Comparison — qualified12000×8000 pair

Rich source and modified JPEG (gain and distant replaced region). Twenty native
metrics, Butteraugli→normal cached→SSIM views, three full96MP PNGs delivered and
independently decoded after source/cache release. All RGB hashes exactly match
native; maximum continuous absolute difference3.410605131648481e-13 (RASE),
SSIM1.4777068457760834e-13; Butteraugli/SSIMULACRA/histograms exact. Four
independent global metric workers, then four SSIM row workers; no tile-score
averaging. Chrome768MiB, peak789973176B, final0,1538.196s complete journey.
Logical scratch peaks Sewar9.984GB, SSIMULACRA4.608GB, Butteraugli19.584GB.
The browser quota estimate is advisory; actual storage errors remain explicit.
Native reference3145.052s under different concurrent load, no speedup claimed.
See `comparison-96mp-proof.json`; the earlier quota-admission failure is retained.

## RGB/HSV Plots — qualified12000×8000 source

User scale1→2 yields24million→6million points using native pyrDown. Every Nx6
float32 value equals the independent native arrays. WebGL paged rendering
visits all points through six draws/style-camera states; full SVGs contain
exactly24million and6million circles (3,516,773,943 and879,363,171bytes).
PNG graphs and full numeric NPZs are independently read after source/cache/table
release. Chrome compute256MiB peak185190080B; renderer32MiB peak18776064B;
final reservations0. Full journey974.298s including SVG delivery under concurrent
load. GPU transfer totals2.88GB/.72GB reflect repeated full rendering, not extra
color conversion. See `plots-96mp-proof.json` and independent Expat/NumPy reader.

## PRNU identification — qualified12000×8000

Two complete11998×7998 fingerprints loaded from an original HDF5 Blob under
256MiB; real JPEG decode, native Wiener residual and NCC ranking, cached rerun.
All residual float64 values and both scores exactly match native. Residual NPZ
and original encoded HDF5 are read after source/database/cache release; NumPy,
ZIP CRC and h5py compare the full arrays. Peak265631744B, final0,2106.276s.
The legacy database remains explicitly legacy/unverified; export preserves its
original bytes. See `prnu-96mp-proof.json`.

The distinct training path is also qualified from two different96MP JPEGs: copy
source and original noise source. Each is decoded/extracted progressively; their
complete11998×7998 running mean is written to a paged HDF5, then read after
unloading both database and query. Every float64 equals the native mean, and both
file names/SHA256 identities match. Independent h5py verifies gzip4,128×128
chunks, completion metadata and all values. See `prnu-build-96mp-proof.json`;
this proof uses real training inputs, not invented metadata on a legacy file.

## Transferred pixel queue — qualified12000×8000

Gradient, color conversion, illuminant, separation, adjustments, contrast and
magnifier: fourteen full RGB views exactly match native, all fourteen PNGs
independently decoded after source release. One256MiB shared engine, peak
254178176B, final0,534.403s. External caches avoid repeated derivative/filter/
prefix calculations. Full magnifier preserves its global histogram/LUT. See
`pixels-96mp-proof.json` and `PIXEL-STREAM-M4.md` for the API/ownership contract.

## Resampling — qualified12000×8000 source and16000×16000 Fourier views

Native EM3×3 whole-source probability converges in one iteration on the rich
copy JPEG. All95,960,004probabilities are exact. The complete96MP composite is
exact too. Fourier of that probability map at gamma2→3 reuses global analysis;
original-source Fourier with native upsampling at gamma2→3 yields256million
values per view and reuses the global spectrum. All four numeric Fourier arrays
are independently compared in full: maximum error2.4417967647849537e-14, mean at
most2.1922298783175492e-17; no RGB channel differs in any of the five full PNGs.
Five numeric NPZs and five PNGs pass full SHA/CRC/NumPy/OpenCV reads after source,
cache and result release. Chrome256MiB, peak238075904B, final0. No binary detector
threshold is added; convergence and native display remain unchanged. See
`resampling-96mp-proof.json` and `check-resampling-96mp-exports.py`. The first
export-retention failure is preserved separately; temporary outputs now export
to temporary storage by default. The native oracle used its own bounded memory
path; no hidden resize or per-tile EM/FFT was substituted.

## Noisesniffer — qualified 12000×8000

The rich distant-copy JPEG above is decoded at full resolution, with block8,
cell50, 20000 samples per bin and fractions 0.25/0.5. Seven useful DCT workers
complete 5614 strip jobs; FFT means, three global native-order sorts, selection
and region growth retain their full-image dependencies. There are 62932762 valid
blocks, 47195559 selected and 23593059 low-noise entries. The native reference
finds no suspicious regions on this image; positive regions remain covered by
the existing native corpus, including the earlier 1MP browser recipe.

Distribution → regions reuses both statistics and analysis. Every byte/value
of mask, cell counts, ordered selected/low-noise lists and distribution matches
the native reference. The complete 950932720-byte NPZ passes SHA256, all CRCs
and independent NumPy reads after source release. Both full RGB views and both
independently decoded PNGs are native-exact. Chrome uses a 256MiB budget,
peak260953616B, final0; complete journey3804.403s. Timing includes contention with
another development recipe and is not a product latency guarantee.

See `noisesniffer-96mp-proof.json`, `check-noisesniffer-96mp-exports.py` and
`check-m4-96mp-pngs.py noisesniffer`. The successful run records its immutable
runtime snapshot. Earlier interrupted/failed attempts remain explicitly separate.

## Dense global duo and compact SIFT — qualified 12000×8000

The same full-resolution rich JPEG is decoded in Chrome. Profile: PatchMatch
Zernike + PatchMatch SIFT, patch3, one native iteration (forward and reverse),
radius12000, minimum5, texture2, threshold0.3→0.2, Similarity/tolerance50 and
6000displayed links per field. Both global fields are complete: Zernike8000×12000
and SIFT7991×11991 (95820081positions). Native global traversal, candidate order,
float scores, coherence, geometry and all original coordinates are preserved.

Analysis4776.3345s produces60groups and12000pairs. Cached-field refilter438.8918s
produces55groups and12000pairs; fields are not recomputed. Both full-resolution
views are produced, with changed area/point/line settings. The complete NPZ is
2687035830bytes,74arrays, using the common ZIP64 format (explicitly forced).
SHA256: `7a341f9d8734a25be863c51ed4c7f38abb5233a04ae05c5530b8f96b57945e8f`.
All entries, CRCs and the ten complete field planes are independently read after
source and engine release. Source provenance, pass identities, original axes,
all targets, threshold counts and displayed pair coordinates are checked.
All12000exported pairs have the known6000pixel same-row displacement. The full
Zernike field contains85739989such targets; SIFT contains92145662. This is a
large-source memory/output qualification against known copies and full-array
invariants, not a separate96MP native bit-exact matcher comparison. The native
small-field and variant proofs remain the numerical reference.

Chrome1536MiB budget, source RGB resident and full fields/descriptors in OPFS.
Peak accounted1336575492B, final retained/cache/active0. The original encoded
Blob is browser-managed, and these values are not an OS-RSS bound. Complete
journey5350.0013s (about89.2minutes), including decode, both analyses/views,
export assembly/hash and delivery. OPFS source-session peak21093551907B; matching
alone records2365396103857logical bytes read, not physical-disk traffic. Random
access under constrained RAM remains costly; this is no universal latency claim.

The real SIFT run retired the optional external bound table after32sampled reads:
mean0.184375ms versus0.002249ms for actual descriptor reads. Exact descriptor
calculation continued, retaining the admitted383280324B resident bound samples.
The SIFT field records1259812273certain bound rejections and2295699212native
comparisons; Zernike records2277504449comparisons. No calibration/probe was run.
The immutable runtime is the production code fromfd799db; the fifth recipe was
committed in9259dd4, with independent-reader assertions strengthened in later
proof commits. Earlier attempts remain explicitly interrupted and unqualified.
See `dense-sift-96mp-proof.json` and its browser/worker/reader scripts.

### Shared variants and supplemental detail

REPRISE-LIMITES permits a common large-source proof for variants using the same
memory adapter. The six public profiles share the qualified global Zernike and
compact-SIFT preparation/stores/matcher/coherence/view/export adapters. Mirror,
scale-bin and quarter-turn decisions/axes/ownership remain checked against native
by `dense-sift-bounds-proof.json`, `dense-paged-supplemental-proof.json` and the
existing six-profile corpus. This does not claim a seven-pass extended/mirror
execution at96MP, nor a scientific archive larger than4GiB. ZIP64 is exercised
on the full2.687GB archive; the optional bound store itself exceeded12GB.

Supplemental detail has its own full-source proof, `dense-detail-96mp-proof.json`:
Chrome256MiB decodes the same96MP original, samples2592points across the image
including edges/tile boundaries, and exactly matches the full native detail and
remap. A second consultation uses the cache without source reads. Translation,
reflection and scale models on80centres use the native32centre sampling rule:
the true6000pixel copy is accepted with NCC1, the two incorrect transformations
are rejected with exactly native scores0.19836191833019257/0.20984899252653122.
Positive transformed detail remains covered by the acquired small native corpus.
The12350byte NPZ is independently SHA/CRC/NumPy-read after source release; all
samples and scores are native-exact. Peak123381029B, final0,122.547s. This tests
the internal finite-support detail method, not another global search or full
high-pass image export.

## Coverage status

All eleven M4 families and the seven transferred pixel tools have completed
large-original browser journeys for their distinct memory paths. PRNU covers
both identification and construction from two distinct96MP JPEGs. Variant
reuse, numeric tolerances, artifact sizes and costs are explicitly scoped above.
The engine/API mission is complete; WordPress UI assembly, combined integration
qualification and publication remain with their assigned owners.
