# Native probability, composite and Fourier integration

`tampering.resampling` supplies both native stages on original grayscale: global
EM per region, the full-size probability composite, and Fourier on each probability
map followed by each explicit composite selection. The standalone
`tampering.resampling.fourier` operation remains available for original-gray FFT.

Parameters:

- `stage`: `probability` (default) or `fourier`.
- `size`: 3 (default) or 5, preserving the native neighborhood and 100-iteration /
  0.01 coefficient-change rule. No regularization or changed singularity cutoff.
- `regions`: null (default whole image) or an array of `[x0,y0,x1,y1]` half-open
  integer source rectangles. Explicit `[]` means no probability regions. Reject
  overlapping, partial, out-of-bounds or too-small regions. Convert the UI's two
  inclusive corner clicks to half-open rectangles before submitting.
- `fourierRegions`: half-open source rectangles selecting from the composite.
- `fourier`: existing `window`, `upsample`, `center`, `highpass`, `gamma`, `rescale`
  parameters, with `rect:null`. The region list controls selection. All requested
  probability maps are also transformed, in their original order.

Original grayscale is normalized over the entire image before region selection.
The border `floor(size/2)` is excluded from each map and unchanged in the
composite. Outside probability regions, the composite remains normalized gray.
A Fourier request with no maps and no selections is refused, as in native.
Numerical degeneracy, zero weights, singularity and non-finite coefficients are
explicit errors. The final map is the last pre-update weight vector, including
when the iteration limit is reached.

The result has `layout:'surface'`. For probability, `surface` is the full source
composite; `rgbSurfaces.probabilityN` are region-interior Gray-LUT previews.
`tables.composite` and `tables.probabilityN` expose exact binary64 values via
`readTable` and `readTableCsv`. Columns are row, column, value/probability.
Map coordinates are relative to its interior, with the source origin and bounds
in `data.maps[N]`; matching display layers carry that origin. Tables are evidence,
not rounded values recovered from a rendered preview.

For Fourier, `surface` is `fourier0`, subsequent spectra are
`rgbSurfaces.fourierN`, and the composite is `rgbSurfaces.composite`.
`tables.fourierN_magnitude` and `tables.fourierN_values` retain the usual paged
frequency-grid tables. `data.fourier[N]` identifies the probability map or selected
composite region, source rectangle/origin and exact FFT crop geometry. Frequency
pixels must not be drawn as a source-coordinate mask.

All surfaces and tables have independent leases. Release each through
`releaseSurface` / `releaseTable`; unloading the source invalidates all its handles.
Source grayscale, EM maps/composite and Fourier stages are cached independently.
Changing only Fourier presentation never reruns EM. Changing regions or size
replaces the analysis cache while previously published results remain readable.
JSON exports describe geometry, provenance and handles; raw values use paged CSV.
Read RGB surface windows for B's PNG export. There is no authentication verdict.

Progress includes `em-original-gray`, `em-gray-extrema`, `em-weights`,
`em-coefficients`, `em-iteration`, and existing Fourier phases, with the region and
iteration where relevant. Independent region fits start immediately in admitted
workers; FFT uses complete-axis workers. A single region remains one global fit.
CPU binary64/FMA arithmetic is required here; there is no approximate GPU fallback,
calibration or trial workload. Public worker cancellation clears sources and
reports `imagesCleared:true`; reload before continuing. Direct adapter cancellation
preserves published owners. An interrupted fit restarts; partial EM state is not
cached in this adapter.

Gray, weight maps, composite and outputs use RAM or temporary storage under the
same budget. A worker regenerates at most 8192 neighborhoods per call; Gram,
variance and GEMV reductions preserve global ordering across pages. F and
inverse-times-F are never held for the whole region. Admission is 16 MiB plus
48×max(8192,5×regionWidth) bytes per active region, with separate render/storage
staging. Dimensions remain bounded to 16384 per EM/FFT axis. Segmented original
JPEG is supported. Other original formats use the existing qualified complete
original-gray decoder and must fit that decoder's admission; no new segmented
PNG/TIFF decoder is claimed.

Qualification: 190 EM cases (104 exact maps/86 native refusals), 12 integration
recipes with both neighborhood sizes, multiple/empty region lists, composites and
two Fourier presentations; exact raw probability and RGB, Fourier within its
existing 1e-8 bound. Ownership, cancellation, coordinate and source lifecycle tests
pass. Chrome original JPEG1024²: map/composite SHA exact at128 and64 MiB, full-map
EM about4.7s; Fourier previews exact. Two independent5×5 regions use2workers at128
MiB and1 at64. Peak accounted memory is121,589,804 / 63,275,040 bytes respectively.
Forced OPFS weights additionally preserve the native full-map SHA; no temporary
sessions remain after the public cancellation/reload checks. Development timings
are observations, not user preflight requirements. See the two browser proofs.
