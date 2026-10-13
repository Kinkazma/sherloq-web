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

For resources marked `localOnly`, the published manifest contains their exact
names, sizes and hashes, but no public payload. They can be supplied through an
authorized local library, an imported standard TAR, or the verified browser cache.
A missing local-only model reports `MODEL_LOCAL_REQUIRED` without requesting it
from GitHub. Complete public downloads and offline preparation skip these optional
files; a supplied file still has to match its pinned SHA-256. SelfDM and Proposal
SuperGlue need these local models. The source includes the conversion scripts and
component notices; the public application does not redistribute their restricted
weights. The full SSG forest is distributed under its separate noncommercial
MSR-LA terms, with the original license and modification notices.

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

For the new clone methods, reconstruct the published baseline and overlay the
reviewed source/resources with `scripts/assemble-method-resources.py`. Use its
identity-only policy when preparing the distribution:

```sh
python3 prepare-distribution.py --output .build/delivery \
  --source-revision FULL_REVIEWED_COMMIT_SHA --resource-policy resource-policy.json
```

The policy records the optional model identities, not their weights. Never add
the fully materialized runtime staging directories to Git wholesale; publish the
builder's filtered `public/` tree. Rebuild the native offline launchers from the
updated source when shipping them: readers predating this policy require every
manifest entry and cannot open a public archive without the optional models.

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
source snapshot and its reviewed increments are identified in
`web/engine-source-identity.json` and the runtime receipts; the current engine is
0.37.0-methods.1, including the new clone methods and the retained atomic SIFT phase increment. Sites can add an optional private packaging overlay with
`--private-overlay PATH`; this content is never copied to the public tree.

On Apache, the scoped header rules remove duplicate PHP/Apache policy headers.
This preserves shared-memory isolation while keeping the PHP entry point valid
on hosts that do not apply `.htaccess` to static assets.

## SHERLOQ Web Local

The **Take offline / Emporter hors ligne** toolbar button opens the installation
flow. This public feature runs in the visitor's own browser on their own device;
it does not generate a Mac-only application or expose the site's private setup.
Publication and the private WordPress installer remain separate deliveries.

1. Save the complete **standard POSIX TAR** outside browser cache, wherever desired.
   An existing archive, verified cached chunks and a connected local library are
   reused. Only missing pieces come from the pinned GitHub resource commit.
2. Prepare the application in the browser that will be used offline. It verifies
   all resources, saves a working copy in browser storage and requests persistent
   storage. A failed write or interrupted preparation retains completed chunks
   and never marks an incomplete installation ready.
3. Open the offline application, install it when the browser offers installation,
   or bookmark its offline URL. Close/reopen it without a connection before leaving.

On iPhone/iPad, first open the preparation link and add it to the Home Screen.
Open **that installed application**, select the archive and prepare it there:
Safari's storage is not transferred to Home Screen web apps. A physical setup
page at the app's start URL supports this initially empty storage context.

The browser cannot authorize filesystem access from a typed path. Selecting an
archive grants read access; no local path is sent to the site. Models, WASM,
original libraries and notices keep their ordinary files and paths in the TAR.
No proprietary archive or per-device binary is required. Preparation is bounded
by transport pieces (up to 100 MB), not the whole archive. Hashing and browser
cache implementations have additional memory costs. This is a complete runtime
bundle of several GB, not a small mobile download.

### Offline execution and restoration

A separate Service Worker owns the nested `assets/offline/` scope. Its public
HTML, modules and manifest are keyed by the SHA-256 of `offline-shell.json`.
Runtime pieces share the existing content-addressed dependency cache. The offline
worker serves those files and byte ranges without any network fallback. COOP/COEP
and MIME headers preserve the engine's workers and shared memory. The public HTML
copy excludes private reporting scripts and server integration.

Updates do not force replacement while an old local window is calculating. An
incomplete resource inventory opens the restoration screen. Selecting the archive
repairs missing/corrupt data without redownloading valid resources or registering
a new worker when disconnected. The stored archive remains available even if the
browser removes its working copy. If **all** site data, including the installed
worker/interface, is erased, the small interface must be installed online again
before restoring the archive. Cookies are not required. Persistent storage is
requested, never assumed to be granted by every device/browser.

This preserves the existing engines. It does not resolve unrelated algorithm
issues or make services that inherently need the Internet available offline.
Device memory, storage quota and graphics/API support still determine which
computations can finish. Installing the interface is not proof that every model
runs on every phone. OS-level installation and browser engine execution are
separate qualifications.

### Reproduction

Build a candidate from already published local chunks, without a model download:

```sh
python3 scripts/build-offline-candidate.py --installed-assets PATH_TO_EXISTING_DELIVERY/assets --chunks PATH_TO_PUBLISHED/web-assets/chunks --output .build/offline-browser-candidate
python3 scripts/verify-offline-archive.py .build/offline-browser-candidate/SHERLOQ-complet.tar
npm test
python3 tests/offline-shell-test.py
```

Use `--shell-only` to refresh the UI preview without rebuilding a multi-GB TAR.
A previous complete TAR remains reusable for unchanged runtime resources.

Automated browser checks use isolated profiles and synthetic pixels, never a
user's images or active browser session. Install Playwright or set its module path
with `PLAYWRIGHT_PACKAGE`. Select the candidate with `OFFLINE_CANDIDATE` and an
existing standard archive with `OFFLINE_ARCHIVE`:

```sh
EXPORT_OFFLINE=1 node scripts/check-offline-pwa.mjs
BROWSER=webkit node scripts/check-offline-pwa.mjs
node scripts/check-offline-download.mjs
node scripts/check-workspace-startup.mjs
```

The PWA check closes the browser, clears cookies, stops the HTTP server, forbids
external requests, reopens the saved profile, runs gradient processing and lossless WebP
export, then removes a dependency and restores it from the archive offline. Chrome
also disables the simulated network and exposes installability checks through its
developer protocol. WebKit's Playwright offline emulation bypasses even a minimal
Service Worker, so its check uses the stopped server and external-request blocking
instead. This is not an OS-level installation test on a physical iPhone.
`EXPORT_OFFLINE=1` additionally exports the complete archive while disconnected,
including repair from a selected TAR when a cached resource is missing. Proof files
stay in `.build/`, outside the public source and private installer. Full archive
exports use attachment navigation through a hidden frame: an anchor's `download`
attribute can bypass the Service Worker in Chromium.

The startup check uses a minimal fixture and real Chrome module imports. It
interrupts the bootstrap and workspace module graphs, dependency preparation,
and workspace mounting. Failed imports or partial mounting require a new document
because a rejected ES module graph stays rejected in that document. Preparation
alone can retry in place. Recovery is deliberate and happens before an image or
calculation is opened; it never automatically reloads a running workspace.

The earlier Go/Python archive readers and their tests remain available as
separate development experiments. They are not the public button's installation
path and do not establish cross-platform PWA qualification. No source build or
local test publishes to GitHub or installs anything on a live WordPress site.
# Migration des gestionnaires de téléchargements

Le ZIP doit conserver les inventaires immuables des versions déjà déployées dans
`compatibility-manifests/`. WordPress remplace le dossier de l’extension, mais le
navigateur peut encore exécuter son ancien Service Worker. Supprimer l’inventaire
de ce worker peut empêcher le chargement du document qui installerait son
remplaçant (`net::ERR_FAILED`, après un HTTP 404 sur l’ancien manifeste).

Le gestionnaire actuel laisse passer le document et les petits fichiers de
démarrage sans attendre cet inventaire. Il conserve une copie vérifiée du
manifeste dans Cache Storage, utilisable après un redémarrage si sa copie serveur
est indisponible. Une erreur temporaire ne verrouille pas les tentatives suivantes.
Les ressources scientifiques restent soumises à l’inventaire et à leur identité
SHA-256. Les mises à jour attendent toujours la fin des fenêtres actives.

`scripts/check-dependency-migration.mjs ANCIENS_ASSETS NOUVEAUX_ASSETS SORTIE`
reproduit le défaut dans un profil Chrome persistant, vérifie sa migration, puis
redémarre ce profil sans aucun manifeste disponible côté serveur. Playwright doit
être installé ; `PLAYWRIGHT_MODULE` peut désigner son installation existante.

## Small public bootstrap

The release asset `SHERLOQ-Web-bootstrap-0.17.1.zip` is a standalone local-web launcher. It contains the small interface, runtime modules and pinned resource manifests. With Python 3.9 or later, extract the ZIP and run `python3 Launch-SHERLOQ.py` inside `SHERLOQ-Web/`; macOS also provides `Launch-SHERLOQ.command`. The launcher serves only on localhost and opens the workspace in your browser. Keep that terminal window open while working.

The selected methods download their verified dependencies from the immutable GitHub origin on first use. The small ZIP does not contain the full scientific model library. Use **Take offline** to prepare and test a complete saved local library before disconnecting. Keep the default localhost port to retain the same browser storage origin between launches; close the previous launcher before replacing the package.

To reproduce the public archive from a finalized public-only UI:

```sh
python3 scripts/build-public-bootstrap.py \
  --plugin /path/to/finalized/public-only/sherloq-browser \
  --output SHERLOQ-Web-bootstrap-0.17.1.zip \
  --notice /path/to/checkout/LICENSE \
  --notice /path/to/checkout/docs/METHODS-RESOURCE-LICENSES.txt
```

The builder rejects a private site overlay, verifies ZIP CRC and enforces a 25,000,000-byte compressed ceiling. The installable WordPress package and private site integration remain separate. Artifact size and SHA-256 are recorded in [the current source identity](../../docs/SOURCE-IDENTITY.json).
