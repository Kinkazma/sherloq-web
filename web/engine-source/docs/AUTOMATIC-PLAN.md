# Automatic analysis selection and submission plan

`src/automatic-analysis-plan.js` ports native selection and submission rules.
This is an internal composition building block, not a delivered automatic
detector operation. It performs no model execution, calibration or measurement.

After **successful** native panel detection, call
`automaticSelection(width,height,detectedPolygons)`. Empty detection creates the
whole-image pixel-centre polygon. Otherwise it appends the enclosing rectangle
only when no exactly equal ordered polygon is present. Detection failure or
cancellation must not be passed as an empty successful detection.

Pass the resulting selection, edited coordinates and disabled indices to
`automaticAnalysisPlan({width,height,regions,envelope,disabled,cpu,complete,
d2Minimum})`. All returned arrays are owned; coordinates remain float64 source
pixel centres. An empty manual selection, or all disabled zones, enables no
jobs. Never send an empty disabled job to an engine that interprets empty regions
as whole-image. Equality follows native tuple order, not hull equality or rounded
display identity. Duplicate active polygons remain in classical submissions;
D2PRL deduplicates exactly equal polygons in first-occurrence order.

The four groups are PatchMatch, SIFT, Forgeryscope and D2PRL. Complete analysis
adds one ELA group. The dense group includes both descriptor families, mirrors
and native scale hypotheses; those passes are not separate progress groups.
Forgeryscope runs only on an active envelope. Disabled non-envelope polygons
remain exclusions. Active non-envelope polygons become compact guides only if
the envelope belongs to the selection. SIFT uses those original coordinates
with compact mode disabled, reflected matching enabled, independent ROI
features, minimum 10, ratio .725 and Affine RANSAC (5 px, 10 matches).

`native` retains the exact positional PatchMatch/SIFT tuples and native
Forgeryscope/D2PRL selection dictionaries. `jobs[0].params` and
`jobs[1].params` fit M4 DenseCopyEngine and M3 SparseCopyEngine respectively.
The CPU preference is recorded at plan level; the shared runtime must map it to
its compute profile/backend rather than invent a detector parameter. The last
two jobs still carry **native polygon contracts**: they must not be forwarded
unchanged to M2's RGB crop API or D2PRL's rectangle API. The adapters described in
`AUTOMATIC-AI-REGIONS.md` now provide D2PRL requests and real M2 crop/mask/offset
composition. Full orchestration and scientific exports remain integration work.
The ELA job is only selection/exclusion scope; complete
cell and energy profile behavior remains in the actual ELA implementation.

Qualification: `generate-automatic-plan-reference.py` calls actual native
`automatic_clones.parameters`, and executes the widget's actual AST methods
`auto_ready`/`start` with inert submission recorders. Eleven selections cover
fallback, duplicate and reordered polygons, fractional coordinates, disabled
envelope, disabled panel, all disabled, CPU and thin/degenerate dimensions.
Node compares all submitted parameters exactly. The cases with valid detector
dimensions were also admitted by the actual M3/M4 parameter validators at
M3 `938fe74` / M4 `97b50bf`; all eight plans produced M4's eleven passes.
Thin/degenerate selections are faithfully planned, but this does not relax any
individual detector's validity checks (M4 rejects a one-pixel-wide image).
No detector outputs are qualified by these planning tests.

This module adds no operation to the public registry. Existing composition
relations/corroboration and display state remain separate qualified primitives.
