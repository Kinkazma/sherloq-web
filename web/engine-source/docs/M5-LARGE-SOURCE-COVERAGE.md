# M5 source-size qualification

Integration runtime through `0.31.0-integration.18`; each proof retains the version actually executed. The large-source tests below use original 12000×8000 pixels (96 MP), not a preview. Fixtures vary by family: the source/ELA corpus uses seed130014, while the combined automatic recipe uses the separately pinned rich M2 JPEG described below.

| Family | Format | End-to-end | Accounted peak / budget | Storage | Evidence |
|---|---|---:|---:|---|---|
| Source + global classic ELA + cached alternate view + full PNG | jpeg | 24.58 s | 136,623,264 / 268,435,456 B | OPFS | Source full RGB and both ELA views exactly match native SHA256; complete 288,100,808-byte PNG pages/hash read after source unload |
| Source + global classic ELA + cached alternate view + full PNG | png | 33.21 s | 43,357,184 / 268,435,456 B | OPFS | Source full RGB and both ELA views exactly match native SHA256; complete 288,100,808-byte PNG pages/hash read after source unload |
| Source + global classic ELA + cached alternate view + full PNG | tiff | 43.43 s | 42,241,184 / 268,435,456 B | OPFS | Source full RGB and both ELA views exactly match native SHA256; complete 288,100,808-byte PNG pages/hash read after source unload |

All retained/cache/active memory and temporary job files are released. Accounted memory excludes browser-managed Blob residency; load metrics report the original Blob size explicitly. Times are complete functional test times, including full output reads, not isolated kernel benchmarks. Native reference generation does not resize or change the original decoded RGB. See m5-96mp-source-ela-proof.json and scripts/generate-m5-large-source.py.

Covered paths: baseline JPEG scanlines, static8-bit RGB PNG scanlines, uncompressed8-bit RGB TIFF strips, global JPEG75 recompression, ELA RGB/grayscale lookup, alternate cached view, row-wise PNG encoding and paged export. Existing smaller format/algorithm proofs remain; the16-bit Adam7/BigTIFF and progressive/EXIF6 qualifications below extend this initial coverage. No claim that every TIFF codec or alpha policy is separately qualified96MP.

Still pending >=94 MP: combined real PM/SIFT/Forge/D2/ELA composition. ZERO/energy archives now use ZIP64 when required; a format capability is not a complete large-image computation proof. All-disabled or empty constant images do not satisfy the rich-structure composition requirement.

UI: engine APIs delivered; final WordPress run is pending B using WORDPRESS-AUTOMATIC-RECIPE.md.

## Byte and perceptual digests — qualified96MP

Engine4c2e130, original rich M2 JPEG with distant copied boxes, SHA256
`7a6ac1368fd28adbbf841a88b3b897f791695ac6fe265c7ba6c9a93f36d704ca`.
All ten original-byte hashes match independent Python hashlib outputs. All six
perceptual arrays, including float64 Color moments and global Radial variance,
exactly match native OpenCV4.11 on the complete12000×8000 decoded original.
Only each native algorithm's own preparation resize is used. No runtime changed.

Chrome256MiB shared budget, OPFS source, peak141323360B and final owned memory0.
Digest heap peaks at20185088B under64MiB,1570 source windows, maximum1368000B.
Load1.523s, analysis13.902s, owned cache0.2ms without recalculation, full journey
15.558s under shared load. The complete4688-byte JSON is hashed and parsed after
source unload and all sixteen hashes rechecked. Temporary inventory is restored;
known codec heap30867456B before worker termination is reported separately.
See `m5-digest-96mp-proof.json` and `m5-digest-96mp-native-reference.json`.
The existing small cancellation/reload and OPFS/IndexedDB proofs are reused.

## JPEG curve and Ghost — 96 MP

The new stored grayscale JPEG path preserves OpenCV RGB-to-gray integers, one global ISLOW stream per quality, and exact global absolute-error sums. It starts useful qualities immediately under the common budget, shares source passes among workers, retains only scalar losses, and retries remaining work through a real serial streaming kernel on worker resource failure. Encoded JPEG bytes are stored outside the bounded16MiB codec heap. The previous mem_dest implementation exhausted its bounded heap on the rich96MP case; raising the old limit was not used as the repair. Small curves retain their existing path.

The original rich PNG includes a1500×1200 patch copied from(16,32) to(8501,6203), without recompressing away its grid. All101 curve values match native exactly; the quality panel and repeated curve reuse these values. CSV contains every value. Native shifted Ghost(7,3), qualities60/80/100 and cached80/100 subset: full raw and normalized arrays match exactly, alternate palette retains evidence. Full37,766,698-byte JSON includes all scientific samples and block views, decoded again after source unload.

Chrome154 fresh normal profile, CPU4 useful curve workers /3 Ghost workers, shared1GiB budget, peak1,006,542,048 accounted bytes. Curve75.20s, Ghost6.40s, whole qualification99.71s including loading, full comparisons and export. No assertion of isolated benchmark speed: other qualification jobs were active. Cleanup releases all retained/cache/active memory and temporary files. See m5-jpeg-96mp-proof.json. Dedicated stored-kernel tests cover actual serial fallback and cancellation; existing112MiB public API case now uses16MiB codec heaps and remains exact.

Temporary physical storage is now sharded at1GiB; logical arrays and ZIP/NPZ offsets remain unchanged. Chrome's private context reproduced silent failed truncation and impossible write counts on very large files; eager size and byte-count checks now reject these failures. A private context also refused a384MB allocation at about4.13GB reserved despite reporting10GiB quota. Normal fresh profiles use the real disk-backed OPFS path for full scientific archive qualification. This is an observed context limitation, not a successful private-mode94MP claim. See OPFS-LARGE-ARRAYS.md.

## ZERO — 96 MP

Chrome154 normal profile,256MiB shared budget, native global votes/significance and global components on the copied rich source. Foreign search actually visits10,148,551 support pixels in579,713 components; missing-grid search visits7,407,902 in52,084 components. One significant foreign region and six missing regions retain exact native bounds and grid identities. All three full RGB views match native exactly. Eight full scientific arrays match bit-for-bit;64 grid significance values differ by at most1.618e-9 in log10 NFA. Reported region significance differs by at most3.638e-12.

Calculation207.13s, full NPZ assembly and hash59.62s, whole qualification344.09s including all window reads and complete archive readback.3,840,009,430-byte NPZ retains native float64 luminance/NFA and int32 votes/masks. Its scientific fields and full SHA are read after source unload. This archive is below the ZIP64 threshold; the separate shared ZIP64 tests cover64-bit headers/offsets. Peak266,841,568/268,435,456 accounted bytes; cleanup budget0 and unchanged temporary inventory. See m5-zero-96mp-proof.json.

Energy96MP qualification is also testing a memory-local global component traversal. Its horizontal runs preserve native8-connectivity, support, strong-pixel counts, component count, labels and row-major score median. The upper bound on queue runs is `ceil(width/2) * height`, derived from disjoint horizontal runs, not an arbitrary result limit. Existing exact native segmentation/quantile/preparation tests pass. Eight-millisecond cooperation retains cancellation checks without a separate clamped timer for every page. Both96MP runs now pass with identical native scientific results. The pre-change run completes in889.66s versus195.75s after optimization (4.54× observed whole-test speedup). First calculation487.14s versus79.61s, segmentation301.62s versus16.92s, and threshold-only refilter304.09s versus19.30s. These are single functional before/after runs with other qualification jobs active, not isolated repeated benchmarks. See m5-energy-96mp-proof.json and m5-energy-96mp-optimized-proof.json.

The optimized manual energy pipeline completes in195.75s at96MP, including loading, two meaningful thresholds, full numeric window reads, retained original result, cached repeat, and complete scientific export readback after source unload. First calculation79.61s (preparation54.46s, segmentation16.92s); threshold-only refilter19.30s with no recompression or panel detection. Regions contain2,981,898 and3,001,336pixels and exactly match native metadata. All seven windowed numeric planes, all five NPZ arrays, summaries and labels are exact.2,688,012,728-byte NPZ; peak208,432,192/268,435,456 accounted bytes; budget0 and temporary inventory restored. See m5-energy-96mp-optimized-proof.json, implementation f18fe7d. Automatic quantile profiles are now qualified below; cell/peer composition is qualified below as a separate large-source path.


## Metadata, thumbnail and C2PA — 96 MP

Synthetic rich JPEG95 with distant1500×1200 copy, embedded EXIF thumbnail, explicit
zero GPS coordinates and a C2PA test signature. The public upstream sample signing
credentials are used only by the native fixture generator; its public test key
stays external and no user signing credentials are accessed. Source12000×8000,108,755,781bytes; SHA256
34d34b92c7648fd11d51ffa6916c5c3be8c0ddf8c985a61f50c19a3efd3fb512.

Chrome154 normal fresh profile,1280MiB common budget. Complete63-key grouped dump,
explicit GPS result and24,329-byte header HTML exactly match ExifTool13.55; full
JSON exports are parsed and compared. Dump0.79s/GPS0.67s/headers9.18s. Header mode
actually reads109.12MB in8192-byte maximum ranges; it does not substitute a preview.

Embedded bytes, full288MB Lanczos4 resized RGB and full288MB absolute-difference
plane exactly match native core.thumbnail. The difference uses OPFS, original and
resized pixels use segmented RAM. Cache and alternate independently owned views
remain exact. Thumbnail calculation4.72s, complete PNG export5.48s; all288,100,808
encoded bytes and original dimensions/hash are read after source unload.

C2PA initially failed on the old full-JPEG metadata buffer and then its256MiB
hash buffer. The pinned source build streams JPEG headers and uses1MiB sequential
hash chunks, retaining the128MiB WASM ceiling and unchanged cryptographic input,
exclusions, algorithms and trust semantics. The signed asset is integrity/signature
valid; a quantizer mutation and a byte mutation1024bytes before EOF both make
integrity invalid while signature remains valid. Every native validation_results
field and full exported report matches c2patool0.28.0/c2pa-rs0.91.0. No network
requests. Signed validation0.74s; observed heap71,172,096bytes. Total reads142.36MB,
maximum16MiB (other SDK reads); no claim that every SDK read is a1MiB hash chunk.
Seven existing positive/negative/trust cases still pass Node and real Chrome.
Other container formats, box-hash paths and oversized manifests are not separately
qualified96MP by this JPEG data-hash proof.

Whole qualification38.30s, including three original decodes, cached views, full
raster comparisons, complete exports and tail-corruption detection. Peak
1,206,681,226/1,342,177,280 accounted bytes; owned retained/cache/active0 before
engine-worker disposal, temporary inventory restored. Known main codec capacity
130,744,320bytes remains recorded before that final worker termination. Browser
Blob backing storage is outside the account, as in the other proofs. These are
functional timings with other engine jobs active, not isolated benchmarks.
See m5-metadata-96mp-proof.json, C2PA.md and scripts/generate-m5-metadata-96mp.py.


## Automatic energy profiles — 96 MP

The same original rich copied/smoothed source is used for both native automatic
profiles. Sensitive quantiles `[.033,.987]`, thresholds `[2.7,2]`; conservative
quantiles `[.007,.997]`, thresholds `[5.5,4.9]`. All estimated parameters, seven
full numeric planes, five scientific NPZ arrays, panel summaries, integer labels
and positive region metadata match the independent native references exactly.
Regions retain2,998,029 and2,972,681 pixels. Profile sampling retains the native
130,965-point global lattice; eight-millisecond cooperation changes only yielding,
with cancellation checked on each page. No performance calibration is introduced.

Chrome154 CPU,256MiB budget, peak208,444,480bytes. Sensitive calculation142.69s;
conservative calculation114.51s, with no recompression or repeated automatic
estimation. Independent first-result retention and repeat-result cache pass.
2,688,013,684-byte complete NPZ takes31.41s to assemble/hash; all scientific bytes
and the full archive SHA are checked after source unload. Whole qualification
469.70s from engine source loading through both calculations, complete field
reads and export readback; fixture HTTP acquisition precedes this timer. Other
workers were active, so these are functional timings, not isolated benchmarks.
Retained/cache/active/known heaps finish at0 and temporary inventory is unchanged.
See m5-energy-auto-96mp-proof.json and generate-m5-energy-auto-96mp.py. This is
an ELA energy-profile proof, not the combined five-engine analysis qualification.


## Cell profiles, global peers, background and Ghost — 96 MP

The same original rich image with a distant1500×1200 copy and smoothed2000×1500
area uses the native effective80px cell size (requested32),100×150 cells. The
native16384-cell adaptation is unchanged. Descriptor windows with true8px halos
retain full-width HAL arithmetic and source coordinates;64MiB heap maximum,
additional6,912,000-byte RGB rings, no full recompressed RGB plane.

Chrome154 CPU,1GiB budget, peak1,026,933,880bytes. Base cell/background calculation
129.58s;71-quality full-frame Ghost calculation110.38s with4 useful workers and
zero probe/retry. Threshold/minimum change0.972s, zero new cell/JPEG/Ghost phases.
Independent original result and cache remain valid. Overall259.74s from engine
source loading through full native comparisons, refilter, cache and two complete
exports; fixture HTTP acquisition precedes this timer. These are functional
measurements under shared machine load.

The Ghost consumer normalizes its8-byte/sample cube in place, saving a second
213,000,000-byte float64 cube. Its internal admission excludes copies reserved for
the standalone Ghost result contract; that standalone contract and scientific raw
outputs remain unchanged. The initial1GiB composite attempt failed admission
before Ghost; this memory adaptation passes under the same1GiB budget.

Native differences across all15000 cells: content maximum1.1920928955078125e-7,
mean3.973642985026042e-12 (3values); profiles maximum1.4551915228366852e-11,
mean6.468307371202779e-17 (2values); signed scores maximum3.725290298461914e-9,
mean1.655684577094184e-14 (1value). All remaining native fields are exact, including
binary support, counts, background,71-quality Ghost curves/quality/phase, final
scores and labels. Three initial regions and their full metadata are exact.
Refilter exposes five regions, including254cells/1,625,600pixels around the distant
copy. Cell layers retain original origin and80×80 pixel scale.

Complete NPZ exports after source unload:4,666,240bytes/18 scientific fields and
9,183,742bytes/25fields, every scientific byte checked against the owned results.
The references independently cover17/24fields; background_profiles is additionally
verified in export against the calculated output and in the descriptor corpora.
Final retained/cache/active/known heaps0; temporary inventory restored. See
m5-biomes-96mp-proof.json. One full71-quality phase qualifies this memory path;
all64 winning-phase combinations retain the complete small native proof. No
claim of a measured64-phase96MP duration or completed WordPress UI is made.


## D2 in the automatic analyzer — positive96MP

Commit3c21645, Chrome154, real hybrid WebGPU convolution/WASM pipeline, original
12000×8000 JPEG03c0b3127e021f2b8f88cbe044545e0de2127fcdae8a62cd36182821180f2ccb.
Two large selected regions plus full image, distant copied structure and pixel
noise, output-only exclusions. Three actual448×448 native grid inferences.
All six projected fields match the native reference exactly, including the map.
Raw float32 grids max error5.961e-7, mean at most1.572e-8; no decision change.
Initial mask66,664,873 positive pixels, seven regions; minimum17 gives70,069,995
pixels and36 regions. All masks, contours, counts, order and IDs match native.
Tabs preserve identities; refilter uses zero inferences and takes17.877s in the
adapter. Its74.422s harness interval also includes six full native comparisons.

3GiB shared budget, peak3,176,495,903B, RAM/OPFS stores, ownership final0 and
temporary inventory clean. Complete automatic NPZ2,238,869,801B, nine required
scientific/raw/corroboration hashes plus every entry mask, every payload and whole
archive hash read after source/model/analyzer disposal. Total2893.876s under
severe shared CPU load, including all native comparisons; analysis+projection
2354.662s, entry preparation12.773s, export37.809s, complete readback18.624s.
No isolated speed claim or OS RSS measurement. The preliminary CPU recipe was
interrupted without qualification; M1 owns the independent CPU recipe.

`m5-d2-auto-96mp-proof.json`, `scripts/test-m5-d2-auto-96mp.mjs` and
`scripts/generate-m5-d2-auto-96mp.py`. Other detector groups are explicitly absent
in this recipe: it does not qualify five-group composition or WordPress UI.


## Global panel components used by automatic ELA

Helper e68cf79, original rich12000×8000 JPEG7a6ac136...d704ca, all14 native panel
polygons and complete decoded BGR hash exact. Maximal horizontal runs preserve
global eight-connectivity and original coordinates, with bounded page caches and
cooperative cancellation. Chrome154,256MiB, peak204,495,954B; analysis99.197s,
complete decode/detection/BGR-check recipe103.445s; final ownership0 and temporary
inventory clean. Native OpenCV4.11/NumPy1.26.4 reference and144 smaller panel cases
are retained. Timing is under shared concurrent load. This qualifies the changed
panel helper, not a new full ELA export or the unfinished five-group composition.


## Stored JPEG coefficients — qualified96MP

Engine716c106, same rich original M2 JPEG used for the digest and combined recipes.
The new stored-coefficient path retains the unchanged libjpeg entropy decoder,
all progressive scans and native global virtual arrays. Original input is read
in64KiB windows; coefficients spill through the existing common temporary store.
No RGB reconstruction or new DCT replaces the original quantized coefficients.
An8MiB cache and64MiB imported WASM maximum replace the previous resident limit.

Chrome256MiB/OPFS: all nine complete histograms, quantization steps, tails, native
lattice scores and verdicts are exact against the independent native detector.
Three coefficient stores peak at288000000B (in addition to the separately owned
288MB source pixels);192000000B coefficient reads/286080000B writes. Module heap
16MiB observed, calculation accounted peak102825984B. Load1.377s, calculation
0.815s, JSON export14.4ms, full recipe5.069s including backend checks, cancellation
and reload under shared load. These are functional timings, not an isolated gain.

Owned cache remains exact. All17873JSON bytes are hashed and parsed after source
unload, with every scientific field checked again. Cancellation during useful
coefficient reads closes storage before terminating the public worker; a fresh
progressive JPEG then succeeds. The restarted worker peaks at103612416B, final
retained/cache/active0, temporary inventory restored. The two worker peaks are
reported separately because cancellation resets the worker's accounting.

Actual OPFS and IndexedDB both pass the progressive512² case with forced64KiB
cache, three coefficient stores and all nine native histograms exact. Thirteen
coefficient cases,335 lattice cases, public segmented cache and failure cleanup
pass the targeted Node suite. No96MP progressive source-decode qualification is
inferred from the smaller progressive test. See `m5-dct-96mp-proof.json`,
`m5-dct-96mp-native-reference.json` and `JPEG-ANALYSIS.md`.


## RGB16 Adam7 and compressed tiled BigTIFF — qualified96MP

Engine2c584d1, unchanged source decoders, original12000×8000 rich M2 pixels
encoded as16-bit RGB with deterministic nonzero low bits. Native RGB8 conversion
is retained. PNG has seven global Adam7 passes; BigTIFF has1504 deflate/predictor
256×256 tiles, clipped edge tiles and native orientation3. These exercise the
revisited global PNG store and compressed tiled TIFF path beyond the earlier
96MP baseline PNG/uncompressed strip TIFF. No crop or source resize is used.

All decoded RGB bytes match native OpenCV4.11. Repeated original-coordinate
windows agree. Each complete288100808-byte PNG is read after source unload,
hashed, delivered locally and independently decoded by OpenCV; every exported
pixel matches the native reference too. See `m5-formats-96mp-proof.json`,
`m5-formats-96mp-export-proof.json` and `m5-formats-96mp-native-reference.json`.

Chrome256MiB/OPFS, heaps16MiB observed under32MiB per-decoder maximum. Adam7
source172272846B: load13.059s (decode8.133s), full journey32.165s, peak43357184B.
BigTIFF source48940092B: load6.191s (decode5.928s), full journey23.562s, cumulative
engine peak51421184B. Both final retained/cache/active0; temporary inventory
restored. Total55.729s under shared load, including every export byte read.
Existing small native codec/orientation/cancellation proofs are reused; this
is not separate96MP qualification of every TIFF codec or every browser backend.


## Progressive JPEG and transposed orientation — qualified96MP

Engine282bf6f, original12000×8000 progressive JPEG with EXIF6, displayed8000×12000,
source8,406,415B/SHA256 `3d5aef51c73f0d1b8ad24307d2fe8cc8319b4afff11e373141315aeecb7bce7d`.
It preserves the rich/noisy M2 source and distant copies through native JPEG90.
Native OpenCV full oriented RGB and native classic ELA75/50/20 are byte-exact.
The progressive decoder retains all global scans/coefficient arrays;3 external
stores,8MiB resident coefficient cache,16MiB observed WASM/64MiB maximum,
1,536,000,000 coefficient bytes read and written. No source reduction.

The lossless orientation cache preserves encoded-order storage, IDs and metadata;
9 windows of at most33,552,000B prepare a second288MB temporary RGB store.
Source temporary residency is576MB. Decode7.653s, cache construction12.360s,
load20.308s; full source read1.198s, ELA5.932s, full PNG export6.795s and readback9.899s.
Whole journey46.739s, Chrome256MiB/OPFS, peak69,271,552B, final owned0 and temporary
inventory restored. Times are functional observations under shared host load.
The uncached comparison c27b071 also completes with exact RGB/ELA and the same
PNG bytes:2179.584s versus46.739s, a46.63× observed whole-journey improvement.
Both retain the same69,271,552B accounted peak. The tradeoff is the additional
288MB temporary source cache. These are two functional runs under shared load,
not isolated repeated benchmarks.

Every288,097,528 encoded PNG bytes was delivered after source unload, SHA256
`da3f41d7740f1a646b3dd4cdfe899a9abb7983b6fec368604ced3793a4464268`.
Independent Python/OpenCV readback checks every pixel against native oriented RGB.
See `m5-progressive-96mp-oriented-cache-proof.json`, its `-export-proof.json`, and
`m5-progressive-96mp-native-reference.json`. Reproduce with
`M5_PROGRESSIVE_VARIANT=oriented-cache node scripts/test-m5-progressive-96mp.mjs`
then `python scripts/verify-m5-progressive-96mp.py --variant oriented-cache`.


Progressive/EXIF6 before/after timing breakdown (seconds):

| Stage | Uncached c27b071 | Oriented cache282bf6f |
|---|---:|---:|
| Original load including cache when used | 8.869 | 20.308 |
| Read/hash every source pixel | 236.876 | 1.198 |
| First classic ELA calculation | 947.875 | 5.932 |
| Full PNG encode/hash | 501.724 | 6.795 |
| Read/deliver every PNG byte after unload | 9.410 | 9.899 |
| Whole journey including cached ELA, checks and cleanup | 2179.584 | 46.739 |

The baseline browser and independent reader proofs are
`m5-progressive-96mp-proof.json` and `m5-progressive-96mp-export-proof.json`.
Both complete PNG files have identical288,097,528B length and SHA256. No baseline
failure or interrupted result is used as a successful timing measurement.


## Derived original bytes — qualified96MP

Engine0e9cdfc, rich copied12000×8000 M2 original21,167,770B, same pinned SHA above.
The public worker applies insertion, replacement,8193-byte deletion and append
using original byte coordinates. Original SHA and hex windows around all edits
remain exact. The21,159,609-byte derived Blob survives source unload; every byte
is hashed in the browser and streamed to the independent Node reader, matching
Python slicing/hashlib SHA `14e08c50309bbfc23ad2f71daeac4cf1edcf6546ba215b3c304e4fffc5084650`.
These explicit raw edits make no image-validity or signature-integrity claim.

Chrome256MiB/OPFS, peak64,122,778B, final owned0/temp cleanup. Derivation itself
uses5206 accounted staging bytes,43 inserted bytes and no complete source copy;
Blob residency remains browser-managed. Load1.371s, derive1.5ms, complete journey
1.739s under shared load, including full output readback after unload. Existing
small cancellation/reload, overlap and immutable-patch tests cover unchanged code.
See `m5-derive-96mp-proof.json`, its native reference and `ORIGINAL-BYTE-ENGINES.md`.


## Targeted contiguous JPEG storage fallback regression

Engine9d9759a also verifies the distinct legacy contiguous-load boundary on a
10000×5000 JPEG: its decode still fits the old codec while full DCT coefficients
require external storage. This50MP regression is additional to the full96MP
segmented-DCT proof; it does not replace that qualification. Test-only worker
setup disables OPFS, forcing real IndexedDB for the standalone DCT session and
JSON export. Passing the common Budget fixes the previous missing-budget refusal.
All nine native histograms, continuous fields and decisions are exact. Cache and
full14,170-byte JSON/hash after unload pass, as does temporary inventory cleanup.
Chrome2GiB, peak1,240,051,403B (mostly the unchanged contiguous-load admission),
final owned0; codec capacity182,845,440B is reported before worker termination.
Whole journey1.082s under shared load. See `m5-dct-contiguous-proof.json`, its
native reference and `scripts/test-m5-dct-contiguous.mjs`.


## Five actual groups — positive interaction recipe (2.9 MP)

Frozen runtime c6b6954/API.15, original public2008×1444 JPEG SHA256
`43ebe5fbe0c5786280753926ff3fe4f355c791f527ba48fa767df20b01bb0e6d`.
All five real groups finish under one6GiB public worker budget, each in one
attempt: Extended PatchMatch with all11 native passes/eight iterations, SIFT
Panels+Text/reflections, Forgeryscope Auto, D2PRL, ELA Ghost/background. No
provider substitution, crop or algorithm reduction. Peak6388093709B, final
retained/cache/active0; known codec heap16MiB is recorded before worker termination.
Temporary inventory is restored after disposal.

574 initial visible entries,628 after the D2 minimum17 refilter;142 paired entries
span more than500 original pixels, across both dense methods, SIFT and Forge.
Repeated analysis uses the same cache; tab/opacity changes preserve IDs/colours
and attempt counts. Corroboration, ELA preview and low/high energy layers remain
readable. D2 refilter takes0.675s and invokes no detector again.

Total2059.973s (34min20s) under concurrent host load: analysis2002.121s, export
21.556s, complete readback29.188s. These are functional timings, not an isolated
performance comparison. The639493485-byte NPZ survives source/model unload;
all910 fields, every payload and the whole archive are checked in the browser
and independently with Python zipfile/NumPy, including ZIP CRCs and dimensions.
Archive SHA256 `d283af601e94f7834014ccd379acef2c9c4c6900bb1e091a70ec5f82f9255e45`.
See `m5-complete-small-positive-proof.json` and
`m5-complete-small-positive-archive-proof.json`.

This establishes the actual five-group interaction/lifetime/export path on this
positive source. It is not a >=94MP qualification or a new full native inference
oracle. The separately frozen rich96MP run still has to finish. Later IndexedDB,
Composite and M3 guard updates retain their separate scopes in
`m5-complete-runtime-reuse.json`.


## Adaptive dense cache follow-up — qualification in progress

Commit `f9af08c` changes only paged matcher memory planning. Caches now use the
admitted shared workspace instead of a fixed 16 MiB descriptor-cache ceiling.
Small Chrome/OPFS comparisons preserve complete targets, distances, coherence,
masks and comparison counts, including SIFT mirror/scale/quarter-turn variants.
The first96MP Zernike/SIFT journey on f9af08c completed with all ten full
planes exactly equal to the acquired M4 hashes and a complete independently
verified2.687GB ZIP64 archive. Whole journey92.57min versus baseline89.17min
shows no observed speedup; timings were recorded under shared host load. See
`M5-DENSE-CACHE-MEMORY.md` and `m5-dense-cache-browser-proof.json`.

The earlier five-group automatic run remains frozen on `b364e4c`. Its eventual
result must keep that binding; it cannot establish the speed of the new caches.


The phase refinement `9f527fd` preserves the large sorted initialization batch,
then reuses its workspace for propagation caches. Imported WASM heap growth is
charged before allocation, including allocator fragmentation. Nine targeted
Node tests and real Chrome cache-migration/native-parity and peer-pressure
checks pass. Its separate96MP recipe completed with the same scientific
parameters and source: all ten complete planes match the acquired baseline,
and the full2,687,035,878-byte archive passes independent CRC/SHA verification.
Whole journey85.98min versus baseline89.17min is an observed3.58% reduction
under shared host load, not an isolated performance guarantee. Peak accounted
memory1,336,575,492 bytes/1.5GiB; final owned memory zero. Both cache recipes
retain their actual runtime bindings. The complete default profile is still
pending on the older b364e4c runtime.


## Current-runtime five-group positive qualification (2f89712)

The `small-positive-cache` recipe passes on the same original2008×1444 positive
source as the acquired c6b6954 recipe. All five actual groups complete in one
attempt, including all eleven Extended dense passes with eight iterations.
IDs/colours,574 initial entries,628 after D2 refilter and142 distant paired
entries are preserved. Views, cached reuse,0.671s refilter and complete export
after source/model release pass; final temporary inventory is clean.

Whole journey1,201.293s (20min01s), analysis1,151.228s, versus acquired
2,059.973s (34min20s) and2,002.121s. The observed whole-journey reduction is
41.68% on shared-host functional runs; it is not an isolated cache-only
benchmark or an estimate for96MP. The dense group finishes at1,143.566s versus
1,995.126s previously. All groups use their first attempt. Peak accounted
memory6,410,824,549 bytes under6GiB; final retained/cache/active memory zero.

The639,499,129-byte archive has910 entries, SHA256
`c1db1335859bd2e1b107f2896dfdbecf58003227800ba08f2640cd3b524d3175`.
Independent zipfile/NumPy checks all CRCs, every full payload and the whole hash.
All908 scientific arrays are exactly equal to the independently verified prior
recipe, including604 dense arrays across all11 maps, geometry and detail
planes. Only metadata/provenance arrays differ. This establishes the new
allocation path under actual five-group cohabitation on this source; it does
not replace the still-running default96MP combined qualification on b364e4c.
See `m5-complete-small-positive-cache-proof.json` and its archive-proof companion.
