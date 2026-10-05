# Source layout and reconstruction

| Path | Contents |
| --- | --- |
| `web/wordpress/` | Interface source, resource transport, tests and build scripts |
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

Reconstruction verifies all 5,237 ordinary files (6,856,237,451 bytes). The 4,224 unique pieces occupy 6,607,933,466 bytes. Allow additional disk space for the checkout, restored library and development dependencies. Restoration is required before running tests that import locked runtime modules.

The manifest template deliberately has no remote origin. A deployment origin identifies `web-assets/` at a full 40-character Git commit SHA; the source includes the finalization and browser-check scripts. The scientific runtime resources are immutable. A GitHub branch URL or a Release download is not an interchangeable origin.

The WordPress workspace is inserted with the SHERLOQ Browser Lab block or the shortcode `[sherloq_browser language="fr" height="920"]`. Use HTTPS or localhost. Browser support for workers, storage, isolation and GPU operations must be verified in the hosting environment.

The engine's internal README and qualification reports are development history tied to their individual versions. Use `engine-source-identity.json`, `runtime-lock.json` and the distribution evidence to identify this snapshot; historical headings do not supersede those identities.
