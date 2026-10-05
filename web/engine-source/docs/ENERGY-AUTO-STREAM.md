# Scientific energy profiles from segmented planes

Internal estimateSegmentedEnergy and segmentedEnergyDeviations adapt the existing
qualified scientific estimators to byte stores. They do not perform performance
calibration. The original sampling step is ceil(pixelCount/131072), with positions
0,step,2*step,... over the complete image. Reads preserve this global lattice
across65536-pixel storage chunks. Sample arrays have at most131072 entries, so the
unchanged estimator uses step1 and does not subsample a second time.

estimateSegmentedEnergy accepts three float32 energy plane stores, int32 scope,
energy_summary and the qualified logarithm. It returns the existing tail-knee
quantiles/prominence/status object. segmentedEnergyDeviations accepts low/high
float32 score stores and returns the existing independent one-sided Otsu thresholds.
Inputs remain caller-owned; outputs are small owned scientific parameter objects.
All buffers are admitted under the shared budget and released on return/error.

Maximum estimate staging is28 bytes per sample plus256KiB reading buffer; the
existing estimator additionally reserves12 bytes per sample plus16KiB. Deviation
staging is8 bytes per sample plus256KiB, with another8 bytes/sample plus16KiB for
the existing estimator. Image size affects input storage/I/O, not sample-array
capacity. Progress energy-profile-samples is per complete collection; cancellation
also remains available inside the qualified scientific functions.

All51 existing native estimate cases and81 threshold cases match exactly,
including sample counts131071/131072/131073/262145. Duplicate panel identities,
read failure, memory refusal and cancellation release all buffers. In Chrome154,
the12MiB OPFS preparation proof for1027×1021 and two native panels also checks the
native estimate and score deviations from these external planes and cancellation
during sampling. See energy-prepare-stream-chrome-proof.json. This is helper-stage
qualification; full automatic JPEG-to-region energy analysis is not yet exposed
on segmented sources. No parameter values or methods are substituted.

Run tests/energy-auto-stream.test.mjs and scripts/test-m5-browser.mjs
--energy-prepare-stream. The existing scientific estimator implementation is
unchanged. Profiles still use the same sensitive/conservative controls after
these estimates; the future pipeline must prepare the proposed quantiles before
computing the final automatic thresholds.
