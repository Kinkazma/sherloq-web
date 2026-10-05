# Qualification 0.21.0

Scope: segmented isolated-pixel detection with all existing radius/threshold/range,
kind and display variants, plus independently owned RGB, pixel mask, RGB flags,
and complete native-order candidate/CSV tables. No scientific threshold,
resolution, candidate count cap or original-image mutation is introduced.
The runtime still has32 ordinary operations; this is an additional memory adapter,
not completion of all50 panels. WordPress integration remains with B.

- Global regression:122/122 Node tests,0 failures/skips/cancellations,
  233804.596833 ms,concurrency2. After final cancellation checkpoints,4/4 targeted
  table/allocation tests pass, including the additional empty/failed CSV test.
  Final frozen API/table/allocation rerun:11/11 tests,0 failures,1018.214625 ms.
- Native synthetic corpus:1458 full comparisons (486 settings/cases ×3 row groups)
  of display, RGB flags,0..3 pixel mask, count and CSV bytes. Small images, global
  borders, segment seams, both radii, all kinds/views and threshold extremes pass.
-144 oriented comparisons cover all eight EXIF transforms and native y,x,BGR row
  order; orientations5–8 also force external sorting.32 cancellation cases leave
  only the original source retained. API ownership, stale revisions, type guards,
  independent releases and source invalidation pass.
- External numeric radix ordering uses exact keys beyond2^32. The real browser
  storage recipe sorts100003 records with8 MiB engine RAM over OPFS and forced
  IndexedDB in Chrome154.0.8037.58, Firefox155.0 and WebKit26.6 (IndexedDB fallback). Complete rows match an
  independent oracle. Cancellation and injected write failure leave no arrays
  or database artifacts. This is not a physical quota-exhaustion test.
- Chrome, Firefox and WebKit pass the96MP public synthetic JPEG with five settings,
  including EXIF6. Four native windows each validate display, mask and flags;
  first-case full-raster hashes match. Every case matches the complete candidate
  table and native CSV byte hash, up to843375 candidate channels. No output is
  silently truncated. Empty-table CSV retains the header in the smaller corpus.
- Accounted peak163437136 bytes in Chrome/Firefox and166914640 in WebKit under256 MiB, plus the browser-managed original
  JPEG Blob tracked separately (12070078 bytes; EXIF6 adds36 bytes). Source/RGB/flags use temporary
  storage, mask and these candidate tables fit RAM; oriented ordering fits the
  admitted two-buffer path. Larger tables have a separately tested external path.
  Functional cancellation observations15.9/113/114 ms, with all storage closed before
  worker termination and zero artifacts after unload/disposal. Not process RSS,
  isolated performance evidence, GPU validation or a native-Mac speedup claim.

The scalar classifier may stop on proven-negative inequalities; adding neighbors
cannot restore either a failed hot/dead inequality or an excessive range. Native
outputs and counts remain exact. No new compute pool, preflight or saved profile
is introduced. See SEGMENTED-DEFECTS.md and the public native reference recipes.

The weight inventory now includes native median_b64.json and jpeg_qf.mdl, omitted
by the previous extension filter:85 present paths, still three blocked groups.
Local existence/hash is distinct from verified conversion and redistribution.
No weight file is copied into this delivery and no model is trained or inferred
by the inventory. The independent native image generator runs existing CPU
algorithms only. Native/WordPress/production files are unchanged.

The extracted0.21 runtime passes all32 ordinary operations, the complete96MP
defect recipe and real external-sort storage/cancellation/failure tests in Chrome.
Manifests, archive SHA256, readback and absence of host paths are checked. Earlier
versioned archives remain unchanged.
Other operations/layouts, formats, models, physical quotas/crashes, shared-page
coordination, WordPress and physical devices remain separate outstanding work.
