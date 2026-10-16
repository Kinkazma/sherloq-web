# Source layout and reconstruction

| Path | Contents |
| --- | --- |
| `web/wordpress/` | Interface source, resource transport, tests and build scripts |
| `web/extensions-source/` | Browser inspection methods, codecs, runtime factories and component notices |
| `web/engine-source/` | Engine source snapshot, C/C++ kernels, tests, notices and development records |
| `web/runtime-sources/` | Readable source and notices for the exact locked runtime slots |
| `web-assets/manifest-template.json` | Original resource paths, byte sizes, SHA-256 values and ordered pieces |
| `web-assets/chunks/` | Content-addressed resource pieces, at most 100,000,000 bytes each |

From the root of this checkout:

```sh
python3 web/wordpress/restore-dependencies.py \
  --manifest web-assets/manifest-template.json \
  --chunks web-assets/chunks \
  --destination web/wordpress/sherloq-browser/assets
cd web/wordpress
npm ci
npm test
python3 build.py --frozen
```

Default reconstruction verifies 5,596 public ordinary files (8,510,208,534 declared bytes). The active public library requires 4,888 unique content-addressed pieces (8,180,499,672 bytes); historical pieces remain available for earlier releases. Four optional research-model files are declared for verified local import and are not hosted as public payloads; see [resource notices](METHODS-RESOURCE-LICENSES.txt). Allow additional disk space for the checkout, restored library and development dependencies. Restoration is required before running tests that import locked runtime modules.

The manifest template deliberately has no remote origin. A deployment origin identifies `web-assets/` at a full 40-character Git commit SHA; the source includes the finalization and browser-check scripts. The scientific runtime resources are immutable. A GitHub branch URL or a Release download is not an interchangeable origin.

The WordPress workspace is inserted with the SHERLOQ Browser Lab block or the shortcode `[sherloq_browser language="auto" height="920"]`. Use HTTPS or localhost. Browser support for workers, storage, isolation and GPU operations must be verified in the hosting environment.

The engine's internal README and qualification reports are development history tied to their individual versions. Use `engine-source-identity.json`, `runtime-lock.json` and the distribution evidence to identify this snapshot; historical headings do not supersede those identities.

The 0.17.0 delivery retains 96 native WASM modules below 300 KiB locally, on demand. The published executable lock records transport-adapted JavaScript; `runtime-source-lock.json` separately records the original reviewed inputs. Exact model and WASM identities are recorded per file, including the new method resources.

The batch PDF/ZIP vendor files retain their original bytes and paths and load on demand. Method-specific optional files can be imported from an authorized local library without blocking downloads for other tools. [Changes and qualification](../CHANGELOG.md).

Local update inventories for this version are recorded in `web/local-sources/0.21.0/` and `releases/0.21.0.json`. The declared scientific scope increment adds 14 resources and replaces 43 JavaScript files; its receipt binds the exact runtime locks and leaves existing model payloads unchanged. Rebuilding retains the previous version’s compatibility manifest.

The ELA layer adds one JavaScript module and replaces four, including the index shared with the earlier scientific increment. Keep the immutable predecessor snapshots and both receipts when reconstructing the executable lock. [Runtime increment contracts](RUNTIME-INCREMENTS.md). The final service-worker assemblers include `dependency-client-routing.js`; older client/resource identities remain available during coexistence and migration.
