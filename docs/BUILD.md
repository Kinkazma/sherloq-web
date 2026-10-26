# Source layout and reconstruction

| Path | Contents |
| --- | --- |
| `web/wordpress/` | Interface source, resource transport, tests and build scripts |
| `web/extensions-source/` | Browser inspection methods, codecs, runtime factories and component notices |
| `web/engine-source/` | Engine source snapshot, C/C++ kernels, tests and component notices |
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

Default reconstruction verifies 6,033 public ordinary files (8,901,106,109 declared bytes). The active public library requires 5,348 unique content-addressed pieces (8,576,266,123 bytes); historical pieces remain available for earlier releases. Four optional research-model files are declared for verified local import and are not hosted as public payloads; see [resource notices](METHODS-RESOURCE-LICENSES.txt). Allow additional disk space for the checkout, restored library and development dependencies. Restoration is required before running tests that import locked runtime modules.

The manifest template deliberately has no remote origin. A deployment origin identifies `web-assets/` at a full 40-character Git commit SHA; the source includes the finalization and browser-check scripts. The scientific runtime resources are immutable. A GitHub branch URL or a Release download is not an interchangeable origin.

The WordPress workspace is inserted with the SHERLOQ Browser Lab block or the shortcode `[sherloq_browser language="auto" height="920"]`. Use HTTPS or localhost. Browser support for workers, storage, isolation and GPU operations must be verified in the hosting environment.

The engine's internal documentation describes its individual components. Use `engine-source-identity.json`, `runtime-source-lock.json`, `runtime-lock.json` and the immutable runtime receipts to identify this snapshot; historical headings do not supersede those identities.

The 0.17.0 delivery retains 96 native WASM modules below 300 KiB locally, on demand. The published executable lock records transport-adapted JavaScript; `runtime-source-lock.json` separately records the original reviewed inputs. Exact model and WASM identities are recorded per file, including the new method resources.

The batch PDF/ZIP vendor files retain their original bytes and paths and load on demand. Method-specific optional files can be imported from an authorized local library without blocking downloads for other tools. [Changes and qualification](../CHANGELOG.md).

Local update inventories for this version are recorded in `web/local-sources/0.25.0/` and `releases/0.25.0.json`. The declared scientific scope increment adds 14 resources and replaces 43 JavaScript files; its receipt binds the exact runtime locks and leaves existing model payloads unchanged. Rebuilding retains the previous version’s compatibility manifest.

The ELA layer adds one JavaScript module and replaces four, including the index shared with the earlier scientific increment. Keep the immutable predecessor snapshots and both receipts when reconstructing the executable lock. [Runtime increment contracts](RUNTIME-INCREMENTS.md). The final service-worker assemblers include `dependency-client-routing.js`; older client/resource identities remain available during coexistence and migration.

The RITA layer binds fourteen executable/readable JavaScript sources and 110 resources, including 108 FP32 operators. Keep `runtime-rita.py`, `runtime-patches/rita-20261019.json` and its predecessor snapshots with the existing layers. Restoring dependencies before building materializes the locked operators from their content-addressed pieces. `build-local-release.py stage --no-bootstrap` prepares versioned source inventories without an installer archive.

The interactive layer adds fourteen reviewed runtime resources, including the PNG decoder. Retain `runtime-interactive.py`, `runtime-patches/interactive-20261020.json` and the `web-0.22.0-interactive` predecessor snapshots alongside the existing layers. [Interactive controls and reconstruction](INTERACTIVE-CONTROLS.md).

The workspace layer follows the interactive layer. Retain `runtime-workspace.py`, `runtime-patches/workspace-20261020.json` and its `web-0.23.0-workspace` predecessor snapshots. It binds fifty runtime sources and seventeen optional OCR resources to the full manifest and both locks. OCR sources, authors, licences and pinned model revisions are documented in [OCR resource notices](OCR-NOISESNIFFER-NOTICE.md).

The optional inline replacement summary is omitted when it exceeds the sixty-four-entry limit accepted by older local updaters. Every current resource still belongs to the SHA-256 verified full manifest and its content-addressed pieces. Complete source changes remain in the immutable runtime receipts; this summary is not the download or installation plan.

The cumulative layer follows the seven earlier receipts. Retain `runtime-cumulative.py`, `runtime-patches/cumulative-20261026.json` and its `web-0.25.0-cumulative` predecessor snapshots. Reconstruction verifies the canonical sources, runtime mirrors, resource manifest and both locks before assembling the interface. Optional model identities are retained from the preceding releases. Raw internal qualification reports are excluded from the current resource catalogue.

Portable native rebuild inputs are under `web/engine-source/native/` and `web/engine-source/experiments/`. The scripts in `web/engine-source/scripts/` include SEEDS support, VIG window kernels, segmentation GPU and D2PRL worker-role reconstruction. `normalize-native-diagnostics.py` replaces absolute diagnostic source filenames without changing WebAssembly instruction sections. Each component keeps its upstream notices and pinned inputs.

Local update identity is the SHA-256 of the complete interface shell. A maintenance rebuild can retain the displayed product version while publishing new immutable source URLs and shell identities. Generic online reconstruction also derives its resource-worker revision from the assembled worker bytes, so startup fixes can be discovered when the scientific inventory is unchanged.
