# Browser dependency distribution

The WordPress application keeps its interface and small runtime modules locally.
Large libraries and converted scientific models are requested only when their
existing engine paths are used. The engine algorithms and runtime bytes are
unchanged. No image or analysis result is uploaded to fetch a dependency.

`prepare-distribution.py` validates `runtime-lock.json`, deduplicates identical
resources and splits large files into pieces no larger than **100,000,000 bytes**.
Smaller files are not padded or combined with unrelated models. These pieces are
ordinary Git blobs, below GitHub's 100 MiB per-file limit. The selected remote
origin is `raw.githubusercontent.com`, pinned to an exact commit. A mutable branch
name or a GitHub release download URL is not an interchangeable configuration.

The browser checks each piece's SHA-256 before delivering it. The service worker
preserves original paths, MIME types, range reads and worker isolation headers.
Downloads admit at most two active pieces and at most 128 MiB of declared payload
at once; browser hashing, response/cache copies and model allocations are extra.
Failed optional cache writes do not prevent online calculation. Missing or corrupt
local files fall back to the published copy. A new delivery waits for the previous
application windows to close before replacing their service worker.

## Local libraries and standard formats

The Resources menu can download the complete library. Chromium can write the
ordinary original files to a chosen directory: original names, directories,
extensions and exact bytes. A saved directory handle is kept in IndexedDB and is
reused when permission allows. Settings export contains its display name, not an
OS access capability. After permissions or browser storage are cleared, the user
must reconnect the folder. An arbitrary filesystem path cannot grant that access.

Other browsers download a streaming **POSIX TAR** archive through the service
worker, without collecting the whole archive in JavaScript memory. It can be
extracted with ordinary archive utilities. Importing the TAR or selecting an
extracted directory verifies and retains its resources in the browser cache.
Browser caches may be evicted; an external saved library is independent of that
cache. Transport pieces are never the user-facing installed library format.

## Reconstruction and deployment configuration

Follow the root [reconstruction instructions](../../docs/BUILD.md) to restore
the locked resources and run the tests. `restore-dependencies.py --origin` also
accepts an immutable GitHub raw origin when pieces are not present locally.

Deployment configuration must identify the full commit containing all resources.
The finalization script accepts that immutable origin. Before using the result,
verify real-origin headers, hashes and browser execution.
`scripts/check-dependencies-browser.mjs` exercises runtime bytes, a large model
range, a synthetic lossless export, local-library reuse and independently decoded
TAR on isolated browser contexts.

The application does not add telemetry or upload images. This statement describes
the application, not the hosting server's logs, WordPress plugins, font services
or GitHub's handling of ordinary download requests.
