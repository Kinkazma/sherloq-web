# Complete automatic ELA composition

`composeAutomaticEla(cellBase,energyBase,options)` implements the native
`complete_analysis.ela_entries` selection step. It consumes **globally prepared**
cell/Ghost/background profiles and optional pixel-energy profiles. It does not
recompress, rerun Ghost maps, detect new reference panels or estimate reference
statistics from selected ROIs. Existing native scientific preparation remains
unchanged.

```js
const {analysis} = await energyCache.analyze(energyParams);
const releaseEnergy = analysis.retain();
let composed;
try {
  composed = await composeAutomaticEla(cellResult.data, analysis.value, {
    budget, regions: activePolygons, excluded: excludedPolygons,
    threshold: 2, minimum: 3, energyThresholds: [5,5], signal,
    temporarySession
  });
} finally {
  await releaseEnergy();
}
// composed.entries, labels, energy_labels, supported, energy_allowed, metadata
await composed.dispose();
```

Caller-owned input providers must stay alive throughout the call. Returned
entries, metadata, masks and labels are independent. A temporary session supplied
by the caller must outlive the returned result. Raw prepared profiles are not
copied into this result: a complete scientific exporter must separately hold its
input provider leases. Passing null energy yields the native cell-only mode.

Selection polygons are rounded with native ties-to-even, then rasterized by
unchanged OpenCV4.11 `fillPoly` in **full-image coordinates**. Exclusions overwrite
the selected mask. A cell contributes only when every pixel in its complete
block is selected. Pixel energy instead uses selected individual pixels. The
global selected mask avoids changing slanted polygon edges through clipping
at artificial row-band boundaries. Partial right/bottom cells remain excluded
from cell evidence while energy can retain their selected pixels.

Existing exact cell segmentation retains legacy/Ghost/background seed rules.
Existing segmented energy hysteresis uses the selected mask and an ID offset
equal to the number of retained cell regions. Native cell IDs hash row-major
int32 [row,column] coordinates plus block size. Energy IDs retain panel/class
identity. Entries include exact cell lists or owned pixel masks and native
external contours. Colors remain BGR. Metadata records
`full_image_reference_profiles_selected_complete_cells` and
`detected_panel_reference_selected_pixels`. Empty selections return empty
evidence; ELA remains excluded from clone corroboration by the existing viewer.

Resource bounds are explicit. The whole native raster mask is admitted in a
private heap (64 MiB baseline + 4 bytes per source pixel, rounded to 16 MiB),
then transferred to segmented RAM/OPFS/IndexedDB storage. That heap is released
before energy segmentation. Contours use a separate admitted heap (64 MiB +
32 bytes per largest required mask pixel, rounded to 16 MiB) so complex masks
have room for native contour work. Both are capped at 2 GiB; exact returned
entry masks and coordinates need additional admitted RAM. No unbounded-size or
fully streamed contour claim is made. Cancellation yields between polygon,
storage, segmentation and contour work; synchronous OpenCV calls additionally
require the containing worker's hard-abort mechanism.

Seven native prepared-profile cases cover all pixels, fractional/concave masks,
disjoint selections, empty/all-excluded selections, a 517-row polygon crossing
multiple delivery bands, and cell-only composition. Native label/scope hashes,
supported cells, entries/IDs/colors/contours and complete metadata are exact;
input profiles remain unchanged. Node verifies cancellation, consumer errors
and admission, plus regressions for the extended native entry kernel.
Chrome exercises fractional and cross-band cases with real OPFS outputs for
scope and energy labels. Five native entries in each case are exact; cancellation
during energy segmentation cleans partial stores. Peak accounted memory
88,245,080 bytes under 160 MiB, final zero, storage inventory unchanged.

This remains a composition primitive. Full public automatic scheduling,
retained result/view wiring and complete export integration are separate work.
The documented M2 network-to-entry discrepancy remains unresolved.
