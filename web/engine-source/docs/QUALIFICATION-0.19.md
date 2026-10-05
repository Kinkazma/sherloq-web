# Qualification 0.19.0

Scope: original-byte hex windows and ten streaming cryptographic digests over
segmented image sources, with explicit visual-hash selection. Small JSON exports
reserve their conservative output bound; export admission includes known heaps.
The runtime still has32 ordinary operations. Seven panel subsets have qualified
segmented memory paths (source, four pixel families, hex, byte digests); this is
not seven fully ported panels or complete coverage of the50-panel mission.

- Global Node regression:116/116 tests, zero failures/skips/cancellations,
  219560.280542 ms with concurrency2. Final byte/provenance and pixel API checks
  additionally pass5/5 tests after preserving decoder provenance on byte results.
- Existing native perceptual-hash behavior is unchanged by default: imageHashes
  defaults totrue. Segmented sources require explicit imageHashes:false; true
  is rejected with UNSUPPORTED_LAYOUT rather than approximating a visual hash.
- New tests compare empty, short and multi-chunk Blob digests against Node crypto,
  byte-window seams/EOF, cancellation, immutable caches and source lifetime.
  A default small JSON export succeeds under52 MiB without lowering its ceiling.
- Chrome154.0.8037.58, Firefox155.0 and WebKit26.6 match all ten Python/hashlib
  digests for the public86,050,184-byte/96MP JPEG, plus five original-byte windows.
  Digest cache, explicit hash selection, JSON, cancellation/reload and source
  unload/disposal pass with zero storage artifacts.
- Accounted peak138,149,888 bytes, plus the separately browser-managed original
  Blob. This is not process RSS. Functional first digest RPC2336.5/2483/2983 ms
  excludes source loading/decoding and UI display; no isolated speedup is claimed.
  Cooperative cancellation observations4.7/81/53 ms are functional, non-isolated.

See ORIGINAL-BYTE-ENGINES.md, source-byte-operations-*-proof.json and the independent
large-byte reference recipe. Hashes prove byte identity, not image authenticity.
The two previously rejected visual hashes and filename ballistics remain explicit.
Source format/module limits, other segmented kernels, physical quotas/crashes,
shared-page resource coordination, model ports, WordPress and physical-device
qualification remain open. Native and production files were not changed.

The extracted0.19 runtime passes all32 ordinary operations and the complete
large original-byte sequence under Chrome. Manifests, SHA256 and archive readback
are checked. Earlier versioned archives remain unchanged.
