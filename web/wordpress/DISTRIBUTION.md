# Browser dependency distribution

The WordPress application keeps its interface and small runtime modules locally.
Large libraries and converted scientific models are requested only when their
existing engine paths are used. The scientific algorithms and WebAssembly bytes are unchanged. A reproducible
`runtime-delivery.py` adaptation replaces generated JavaScript download fallbacks
with a shared, integrity-checked loader and adds session diagnostics. No image or analysis result is uploaded to fetch a dependency.
All WebAssembly modules smaller than 300 KiB are included locally and loaded on
demand; large dependencies keep their immutable GitHub origin.

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

## Reproduction and private packaging

First reconstruct the locked files from the published manifest and pieces:

```sh
python3 restore-dependencies.py --manifest ../web-assets/manifest-template.json \
  --chunks ../web-assets/chunks --destination sherloq-browser/assets
npm ci
npm test
python3 build.py --frozen
```

Paths above are examples relative to a checkout containing the published assets;
adjust them to that checkout. `restore-dependencies.py --origin` also accepts an
immutable GitHub raw origin when the pieces are not present locally.

To prepare a new delivery from a checkout with the locked files staged:

```sh
python3 prepare-distribution.py --output .build/delivery --offline
```

Publish the reviewed `public/` tree through the maintainer's GitHub workflow.
It contains sources and resources. Keep **`private/` outside the public fork and
outside GitHub Releases**. The privately delivered installable WordPress ZIP is
not a public release asset.

After the resource commit exists, finalize the private installer with its real
origin, replacing the example owner, repository and commit:

```sh
python3 prepare-distribution.py --output .build/delivery --finalize \
  --origin https://raw.githubusercontent.com/OWNER/REPOSITORY/FULL_COMMIT_SHA/web-assets/
```

An offline candidate or a local two-origin test is not evidence that the published
GitHub URLs work. Verify the final origin, headers, hashes and browser execution
before delivering the online installer. `scripts/check-dependencies-browser.mjs`
exercises real runtime bytes, a large model range, a synthetic lossless export,
local-library reuse and an independently decoded TAR on isolated browser contexts.

The application does not add telemetry or upload images. This statement describes
the application, not the hosting server's logs, WordPress plugins, font services
or GitHub's handling of ordinary download requests.

## Recovery and session diagnostics (0.14.5)

The shared loader validates HTTP status, expected size, WASM magic bytes and
SHA-256 before compiling. It retains requested/final URLs and the original error
cause. A failed download has bounded automatic retries, then an explicit retry
button. Its pending consumer stays alive, so prior input, output and downloaded
chunks are retained. Uncompressed file streams resume with absolute Range offsets;
compressed streams restart only that file and discard their delivered prefix.
The service worker also keeps pending JavaScript imports alive during a download
failure to avoid poisoning the browser's module cache with a rejected import.

The local session journal spans tools, recalculations and worker lifetimes. It
stores every diagnostic event in IndexedDB, without truncating the session to the
last error. Batches are asynchronous; a small recent view stays in memory. If
storage fails, the report says so and subsequent logs stay in memory. Typed buffers,
images and credential fields are omitted. Exporting a tool report includes the
session; the File menu can also export the complete session independently. No
report is sent automatically. Reloading starts a new session; this is not a crash
recovery store for image calculations.

The published `runtime-lock.json` identifies the adapted executable resources.
`runtime-source-lock.json` records the reviewed engine inputs; native WASM and
model hashes remain identical. Reapplying the adapter is idempotent. The engine
source snapshot is still 0.35.0-export.2: transport changes belong to this UI
release. Sites can add an optional private packaging overlay with
`--private-overlay PATH`; this content is never copied to the public tree.

On Apache, the scoped header rules remove duplicate PHP/Apache policy headers.
This preserves shared-memory isolation while keeping the PHP entry point valid
on hosts that do not apply `.htaccess` to static assets.
