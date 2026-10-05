# Native complete ELA scientific snapshot

`automaticElaSnapshot(raw, selected)` converts an acquired automatic ELA provider
value and selected frame into the nested scientific value expected by
streamAutomaticNpz/exportAutomaticAnalysis. It supplies explicit native shapes
and dtypes for every cell profile, Ghost/background field, selected labels and
scope, three residual-energy planes, optional energy scores/panel scope/labels,
and the cached BGR preview. Supported masks and selected scope are NumPy bool,
not silently uint8; native Ghost phase/quality/index types remain unchanged.

A virtual concatenation streams the three float32 energy planes as one native
3×H×W ndarray, including read chunks crossing quality boundaries. Selected fields
override global labels/support. Preview is H×W×3 BGR. Native profile key,
energy_summary and selected metadata accompany the arrays. Browser-only
width/height/grid/region convenience fields are not mistaken for scientific
arrays. Unknown typed cell fields cause an explicit error rather than dropping
future scientific data.

No numerical payload is copied or recomputed by normalization. Both the acquired
raw-provider lease and selected-frame lease must remain alive and immutable until
export finishes; the completed archive then owns independent bytes. The metadata
retains the actual browser scientific metadata/provenance (including its explicit
semantics and execution boundary), not fabricated native timings or backend
claims. The qualification below concerns every native ndarray, not textual
identity of wall-clock-dependent metadata.

Native preparation always retains three raw energy planes, including when
background/pixel-energy regions are disabled. The provider now computes and owns
those planes in cell-only mode too, without running the unused panel-reference
statistics or energy segmentation. When pixel energy is enabled, these are shared
with the prepared energy cache. The cached preview still reuses encoded JPEG.

The actual native automatic_clones.export provides the full ndarray oracle.
Chrome runs actual global scientific preparation and complete selection, then
streams and reads the archive: all 25 native arrays with energy and all 14 in
cell-only mode match field names, dtype, dimensions and byte hashes. Archives
are 968,790 and 491,658 bytes respectively. This includes bool masks, preview,
raw qualities, profiles, selected labels and source scopes. The updated provider
proof also checks independent OPFS ownership, filter cache reuse and cancellation.
Peak accounted 107,126,160 bytes under 512 MiB including 8 MiB test admission;
final budget zero and unchanged temporary inventory. See
`automatic-ela-provider-chrome-proof.json`.
