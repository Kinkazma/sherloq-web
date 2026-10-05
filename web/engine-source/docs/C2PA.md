# Offline C2PA validation — M5

`metadata.c2pa` validates original encoded bytes with the official
`@contentauth/c2pa-wasm`0.13.2 / c2pa-rs0.91.0, the same Rust SDK version as native
c2patool0.28.0. It runs a real cryptographic reader in a disposable worker. There
is no JS approximation, upload, online trust-list lookup or authenticity verdict.

```js
const result = await engine.run({
  id: 'provenance', imageId: 'source', operation: 'metadata.c2pa',
  params: {trustAnchors: null} // or inline local PEM certificates, max8MiB
}, {signal, onProgress});
const json = await engine.exportResult(result, {format:'json'});
```

For B, render `result.data.manifest`, `integrity`, `signature` and `trust` separately.
Manifest states: present, absent, remote_unavailable, read_error, unknown. Integrity
and signature: valid, invalid, unknown. Trust: not_configured, trusted, untrusted,
unknown. This state policy is the exact native core/c2pa.py policy for the active
manifest. Timestamp and ingredient findings stay in the full SDK validation report;
a trusted signing credential must not be presented as absence of all other failures.
An unsigned source is distinct from a read/runtime error and a remote-only manifest.

`data.report` retains SDK manifests, assertions, ingredients, signature information,
validation_status, validation_results and validation_state. `data.failures` is the
active manifest's failure list. Display all metadata as text, including assertion
content/URLs; no URL in a report is automatically opened. `data.metadata` records
source SHA256, tool/version, offline policy and optional trust-list SHA256. PEM text
is not included in result provenance. Result JSON export uses the existing bounded
export API. Outputs do not alter source bytes, pixels or analysis caches.

## Offline policy and limits

Settings explicitly require read verification, signing-credential trust and timestamp
trust; OCSP and remote manifest fetching are disabled, allowed hosts are empty and
redirects are disabled. The isolated worker replaces fetch with a rejecting function
after loading its local WASM asset. Trust input accepts inline PEM only, never URLs.
`online_revocation_checked:false` is explicit. Built-in SDK timestamp trust behavior
is retained exactly as in the pinned native version. No external trust list is loaded.

This wrapper supports embedded manifests only. External .c2pa sidecars are **not
supported** by the pinned wasm Reader API and are not silently ignored as supplied
parameters. No full c2patool `--detailed` equivalence is claimed: Reader.json returns
the SDK manifest model and validation findings, without all low-level claim internals.
The current validation corpus is JPEG; PNG/TIFF can reach the reader but signed
PNG/TIFF and additional signature algorithms remain unqualified. Large-source
qualification and the streamed JPEG adapter are recorded in M5-LARGE-SOURCE-COVERAGE.md. Validation stays bounded; large manifests and other SDK container paths may still refuse.
Public execution requires a browser Worker. Node tests use the actual same WASM
reader's fromBytes method, not an emulation of browser workers.

## Memory, lifecycle and progress

A disposable nested worker performs one useful validation; no calibration or probe.
WASM memory has an enforced128MiB maximum. Reader.json rejects UTF-8 reports larger
than4MiB before decoding them into JS. Blob reads larger than64MiB are rejected.
The shared budget reserves128MiB heap maximum,160MiB JSON/string/object/transport
allowance,16MiB module allowance, twice min(sourceSize,64MiB) for byte staging,
8×PEM text length and an encoded-source snapshot when starting from a byte array.
Known engine heaps are admitted separately. These are accounting allowances, not
measured total browser RSS. Browser-managed Blob backing storage is not zero RAM.

Source Blobs are passed unchanged; no pixel decode is performed by this operation.
The upstream reader may eagerly buffer small Blobs. Contiguous and segmented engine
records both route through original bytes; no perceptual resize or re-encoding.
Cancellation terminates the owned validation worker and releases its reservation.
The60s timeout mirrors the native process timeout. Direct engine cancellation keeps
the source; main-worker hard cancellation follows the existing reload contract.
A completed result is caller-owned and uncached, so explicit validation reruns trust
and certificate checks. Progress phase `c2pa-validation` marks dispatch, runtime-ready,
and completion; the SDK does not expose an accurate internal percentage.

## Qualification and sources

Seven cases use the upstream public sample signed JPEG and generated derivatives:
valid, content-altered, signature-altered, unsigned, remote-only, correct trust roots,
and unrelated trust certificates. Node and real Chrome compare every validation_results
field and the four summary states against current c2patool0.28.0 with native settings.
No external network request occurs. Tests also cover invalid trust input, enforced
WASM maximum, budget refusal, JSON export, direct cancellation/source preservation,
main-worker hard-abort/reload and zero remaining active reservations.

Fixtures are derived from contentauth/c2patool's public sample files, copied read-only
from the existing pinned native distribution; no user images or private signing keys
are included. Tests/data/c2pa contains only public certificates. The fixture generator
writes only this worktree. See `docs/c2pa-chrome-proof.json` and tests/c2pa.test.mjs.

The original npm acquisition remains reproducible with scripts/vendor-c2pa-wasm.py.
The current source build uses scripts/build-c2pa-stream.py, the immutable c2pa-js
commit and c2pa-rs0.91.0 sources recorded in vendor/c2pa/PINNED.json, and its retained
Cargo.lock. Rust1.96.0/wasm-bindgen0.2.129 compile the adapter. The only SDK patch,
native/c2pa-jpeg-stream.patch, replaces full-file buffering in JPEG read_c2pa/read_xmp
with header reads. It preserves img-parts0.4.0 marker rules and retains one original
entropy byte so its parser recognizes SOS. The SDK still parses the same metadata,
checks the same signature/trust policy and hashes the complete ORIGINAL stream.
No entropy bytes are substituted in cryptographic input. Sequential hashing uses1MiB
WASM chunks instead of the upstream256MiB buffer. Digest algorithms, ordered bytes,
exclusions and range offsets are unchanged. JPEG box-hash/object-location
paths are not newly claimed bounded by this metadata-read patch.

The memory-section maximum remains128MiB and Reader.json limit4MiB. Allocation
refusals now propagate MEMORY_LIMIT instead of looking like an ordinary malformed
manifest. sourceReads reports call count, total and maximum Blob read sizes.
The MIT/Apache SDK and img-parts notices are retained alongside the rebuilt runtime.
Pinned hashes cover sources, lockfile, patch, compiler and distributed binary/glue.

Official sources: [browser SDK](https://github.com/contentauth/c2pa-js/tree/main/packages/c2pa-web),
[WASM bindings](https://github.com/contentauth/c2pa-js/tree/main/packages/c2pa-wasm),
[SDK settings](https://opensource.contentauthenticity.org/docs/tasks/settings/).
