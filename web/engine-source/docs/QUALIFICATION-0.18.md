# Qualification 0.18.0

Scope: deferred temporary storage for results of segmented RAM JPEG sources,
shared staging admission for channel ranks and explicit allocation errors for
all three segmented result adapters. No additional scientific operation or
format is introduced. Original dimensions and parameters are unchanged.

- Global Node regression:114/114 tests, zero failures/skips/cancellations,
  215550.5985 ms with concurrency2. Includes all native scientific families,
  factory deferral/cancellation, unavailable storage and allocation failure
  cleanup with source retention for ranks, bit planes and extrema.
- Chrome154.0.8037.58 / Firefox155.0 / WebKit26.6: three operations on the public
  1MP JPEG under48 MiB. Source initially stays in RAM with no temporary session.
  Holding successive results creates one session at the7th rank,5th bit-plane
  or4th extrema result. First and last RGB/mask windows match the qualified
  full CPU path. Unload, cancellation and disposal each leave zero artifacts.
- Chrome and Firefox use OPFS, WebKit uses IndexedDB with its explicit OPFS
  setup-failure reason. Accounted transition peaks47,185,920 /44,684,874 /
  48,450,624 bytes for the three algorithms. Original Blob residency is separate;
  accounting does not measure process RSS or physical disk use.
- Existing96MP source/histogram, channel-rank, bit-plane and extrema worker
  sequences also pass again in Chrome, including their native windows/full
  checksums and storage lifecycle tests. Earlier per-family Firefox/WebKit96MP
  evidence is documented in0.14–0.17; the new1MP transition test runs in all three.

Raw evidence: lazy-result-storage-*-proof.json and the existing per-family Chrome
proofs. Stage/RPC/cancellation observations are functional, not isolated speed
benchmarks. There is no product calibration, probing, preloading or hidden
resolution/precision change. See LAZY-RESULT-STORAGE.md.

Other segmented algorithms, formats, physical quota exhaustion, abrupt crash
recovery, multi-engine budget sharing, WordPress integration, model ports and
physical-device testing remain open. Native/WordPress/production files were not
changed. Versioned earlier archives stay immutable.

The extracted0.18 runtime passes32 ordinary operations and the complete late
result-storage sequence under Chrome. Manifest/SHA/readback checks pass; previous
versioned archives remain unchanged.
