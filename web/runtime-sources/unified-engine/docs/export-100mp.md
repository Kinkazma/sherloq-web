# Synthetic 100 MP export qualification

This test isolates export from forensic computation. It does not rerun detectors,
alter the previous 96 MP run, or add calibration work to application startup.

## Failure corrected

The completed 96 MP detector run failed while exporting
`root_results_patchmatch_browser_details_metrics_residentAdmission_peakBytes`.
The paged execution route can lack a resident-memory estimate. Its admission
record now explicitly returns `peakBytes: null`. The automatic NPZ serializer
also accepts older records containing unset optional properties: those record
properties are omitted, matching JSON semantics. Undefined list elements, cycles,
unsupported objects and unwrapped scientific arrays still fail explicitly.

## Reproduce

From this engine checkout, with its locked dependencies, Google Chrome, Python,
NumPy and Pillow available:

```sh
node scripts/check-export-100mp-browser.mjs .build/export-100mp-new-run
python3 scripts/verify-export-100mp.py .build/export-100mp-new-run
```

Use a fresh output directory. The test opens its own headless persistent Chrome
profile, starts a loopback-only receiver, then closes that browser. It never uses
the user's browser profile. Files are exclusively created, not overwritten.

The test exercises:

- A 10,000 × 10,000 RGB image, with the production libpng exporter at compression
  6 and 0. Rows are generated on demand; the source has a deterministic pattern.
- The production automatic scientific export, with three complete 100 MP dense
  fields, masks, allowed regions, probability and energy planes, point/pair data,
  and the two full-resolution corroboration planes. The fixture deliberately
  contains the optional undefined metric responsible for the previous failure.
- Automatic ZIP64 selection for an archive larger than 4 GiB, bounded export
  reads and complete transfer to disk. Transfer uses the real export manager's
  `read` API; the local HTTP receiver is test infrastructure, not an application
  upload endpoint.
- Independent verification: every decoded RGB byte and numeric array value is
  compared with its formula using Pillow/NumPy, with PNG/ZIP CRCs, NPY headers,
  shapes, types, JSON metadata and whole-file SHA-256 checked as well.

`browser-proof.json` records browser-side timings, output hashes and memory
reservations. `verified-proof.json` records the independent full readback.
Generated images and large archives remain under ignored `.build/` directories.

The 128 MiB budget bounds reservations accounted for by the engine in this test;
it is not a measurement of Chrome's total physical memory. Timing includes
synthetic generation and the test receiver transfer; it is not a detector timing
or a performance prediction for a different photograph.

## Scope

The first run, in an ephemeral/private browser context, exported both PNGs but
failed before scientific archive assembly: OPFS reported size 0 after truncating
a physical file to 1 GiB (`STORAGE_IO`). Switching the test to its own normal
persistent profile allowed that same allocation and archive assembly. This is
an observed context difference, not a demonstrated explanation of Chromium's
internal failure. The private-context 5.5 GB export remains unqualified; no
production storage limit was weakened to make this test pass.

This qualification concerns export in the tested Chrome build. It does not
establish detector accuracy, an end-to-end result for the old 96 MP run, browser
download UI behavior, or Firefox/WebKit compatibility at this size.

## Result — 5 October 2026

Chrome 154.0.8037.93, normal isolated persistent profile:

| Output | Bytes | Generation, export and local transfer |
| --- | ---: | ---: |
| PNG compression 6 | 1,419,989 | 5.46 s |
| PNG compression 0 | 300,097,599 | 11.03 s |
| Scientific NPZ (ZIP64) | 5,500,023,986 | 230.10 s |

All three exports passed independent full readback. The NPZ contains 26 numeric
arrays plus two JSON metadata entries; every numeric value was compared, not
just boundary samples. Archive assembly took 40.83 s and hashing 37.22 s; the
remaining time includes scratch generation and transfer through the test
receiver. The complete browser test took 247.78 s.

Peak accounted reservation: 79,908,864 bytes under a 134,217,728-byte budget;
final accounted reservation: zero. No detector ran. Unit/regression validation:
41 relevant tests passed. One fixture-dependent test was rerun after restoring
its existing, ignored JPEG fixture to this isolated checkout.

Committed evidence: [browser timings and hashes](export-100mp-browser-proof.json)
and [independent full readback](export-100mp-verified-proof.json).
