# Real detector adapters for automatic sessions

`createAutomaticDetectorProviders({image,budget,dense,sparse,geometry,
forgeryscope,sparseOptions,wasmBinary?})` creates the configured PM, SIFT and
Forgeryscope providers accepted by createAutomaticAnalysisSession. Inject the
actual M4 DenseCopyEngine, M3 SparseCopyEngine, M3 pairedBiomes/biomeSides and M2
Forgeryscope analyzer, constructed for the same original source and shared
Budget. No detector implementation is copied, emulated or selected as fallback.
Absent engines are omitted and the session reports enabled missing groups as
ENGINE_UNAVAILABLE.

Dense and sparse run receive the exact job.params from automaticAnalysisPlan,
with CPU/auto choice and signal/progress. sparseOptions carries the real pinned
English OCR language and any needed models; their absence remains an explicit
error in the real engine rather than skipping Panels + Text. Both return an
owned scientific result without embedding its release function in the raw value.
Dense preparation uses native split/owner-aware point entries; sparse uses the
full SIFT source and native palette without dense splitting.

Forgeryscope run uses analyzeAutomaticForgeryscope: true M2 inference on the
native enclosing ROI, black input exclusions, original-coordinate output arrays
and independent ownership. Preparation uses the qualified native entry conversion
and filters. The known M2 network-to-polygon discrepancy remains visible; this
bridge does not change coordinates, IDs, tolerances or reported provenance to
hide it. The separate D2PRL provider is documented in AUTOMATIC-D2PRL-PROVIDER.md.
These adapters do not dispose the injected engines or the source.

Validation loads actual M3 geometry read-only at commit
938fe74cc0ff165d6cae268243681e0c07f70264 and uses saved native detector outputs:
10 classical cases validate exact parameter/CPU/OCR forwarding and exact native
entries; five Forge cases validate exact entry conversion without invoking its
model. All output owners release to zero. Protocol engine wrappers stand in only
for scheduling/forwarding checks, so this is not new complete-inference evidence.
See automatic-providers-proof.json and scripts/study-automatic-providers.mjs.
M3/M4 remain external integration dependencies; the runtime contains no imports
from their development worktrees.
