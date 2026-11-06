# Reconstructing the TruFor Mini browser resource catalogue

TruFor Mini uses its own ONNX operator directory and the shared neural runtime.
It does not depend on the complete TruFor operators or their Channel 333 output.
These instructions generate source/resource metadata. They create no installer,
publish nothing and require no installation-specific configuration.

Start with the published SHERLOQ source tree, its existing locked resources and
the reviewed Mini source changes. Commands below run from that source root.

## 1. Reconstruct the operators

Follow `web/engine-source/scripts/trufor-mini-reproduction/README.md` to rebuild
the frozen Mini state from the separately obtained original TruFor weights and
run `export-trufor-mini.py`. Its output is an operator directory containing
`manifest.json` and the ONNX files. The exporter runs the three supplied
`compose-mini-*.py` scripts. It performs no reference-image inference by default.

Copy the unchanged `LICENSE.txt` and `LICENSE_CMX.txt` from
`web/engine-source/scripts/trufor-mini-reproduction/licenses/` into that operator
directory. The original license terms remain applicable.

## 2. Generate the deterministic additions

```sh
python3 web/wordpress/scripts/trufor-mini-resource-plan.py \
  --segments work/trufor-mini/operators \
  --engine-source web/engine-source \
  --ui-version 0.33.0 \
  --output work/trufor-mini/resource-additions.json
```

The default verifies every operator's length and SHA-256, the frozen state
identity and both license identities. It emits:

- Exact `files` and `chunks` entries for the Mini operators, manifest, licenses
  and 19 explicit engine source companions.
- The `m2.trufor-mini` feature, its complete selective offline resource list and
  its sole dependency, `resource.neural-runtime`.
- Raw and delivered identities for both dependency locks. Model bytes remain
  identical in both locks. Each engine companion receives exactly
  `import "../../runtime-context.js?v=0.33.0";` followed by its raw source.
- A canonical engine source inventory fragment covering the Mini sources,
  reproduction files, exporter, composition scripts and tests.

The complete TruFor and Channel 333 entries are preserved. Unknown neighboring
files in the operator directory are not enrolled. Each reviewed Mini file must
fit the standard 100,000,000-byte chunk limit; the supplied graphs do.

`--metadata-only` produces an explicitly unverified planning fragment using the
operator manifest's hashes and current file lengths. It reads no ONNX bodies.
This mode cannot write merged manifest or lock outputs and is not a substitute
for the default full verification.

## 3. Merge into a separate metadata tree

To merge verified additions, supply the complete reviewed dependency manifest
and both current locks. The output directory must not exist:

```sh
python3 web/wordpress/scripts/trufor-mini-resource-plan.py \
  --segments work/trufor-mini/operators \
  --engine-source web/engine-source \
  --ui-version 0.33.0 \
  --base-manifest web-assets/manifest-template.json \
  --source-lock web/wordpress/runtime-source-lock.json \
  --runtime-lock web/wordpress/runtime-lock.json \
  --merged-output work/trufor-mini/metadata \
  --output work/trufor-mini/resource-additions.json
```

The three output files retain their repository-relative paths. Review them
before replacing the corresponding canonical metadata. Only the Mini family
and the explicit 19 engine companions are replaced. Stale Mini filenames and
unreferenced chunks are removed; all unrelated resource entries remain intact.

Materialize every Mini model file at
`web/wordpress/sherloq-browser/assets/individual-assets/trufor-mini/<file>`.
For each model file the plan's single chunk is the file's exact original bytes;
store that same stream as `web-assets/chunks/<sha256>.bin`. For the 19 engine
companions, prepend the exact `transportPrefix` recorded in `runtimeSources`,
write the delivered stream at its `unified-engine/src/...` logical path and
store that delivered stream under its chunk SHA-256. Never add a second prefix.
The raw canonical engine files remain under `web/engine-source/src/`.

The 11 reviewed interface modules must also be copied from
`web/local-sources/0.33.0/` to `web/wordpress/sherloq-browser/assets/`:
`backend-mode-preferences.js`, `batch-catalog.js`, `batch-evidence.js`,
`native-context-map-evidence.js`, `native-context-scalar.js`,
`parameter-preview-policy.js`, `tool-catalog.js`, `tool-client.js`,
`tool-models.js`, `tool-tree.js` and `tool-workspace.js`.

## 4. Regenerate derived application metadata

Use these supplied public scripts after integrating the source/resource inputs:

1. `web/wordpress/scripts/write-code-identity.py` generates the code identity.
2. `web/engine-source/scripts/build-engine-worker.mjs` builds and checks the
   selected worker from those exact engine/UI sources. Its generated entry,
   content-addressed bundle and build receipt replace the previous selected
   worker's resource entries. They are derived outputs, not Mini model files.
3. `web/engine-source/scripts/runtime-manifest.mjs` enrolls runtime sources;
   `source-manifest.mjs` recursively enrolls sources, scripts, tests and notices.
   Retain the 21 reproduction files and three composition scripts in that
   source inventory. Neither script executes image analysis.
4. Regenerate the complete dependency catalogue, both locks and the current
   snapshot with the resulting worker/code-identity/inventory bytes. The Mini
   resource plan supplies exact additions; the release owner's existing global
   metadata entries retain their own reviewed identities.
5. `web/wordpress/scripts/generate-feature-catalog.py` generates the feature
   catalogue from the merged dependency manifest and its verified metadata.
   Its Mini feature must match `resource-additions.json` exactly.
6. `web/wordpress/offline-shell.py` regenerates the shell from that catalogue,
   manifest identity and reviewed interface. `runtime-snapshot.py` validates
   canonical inputs, both locks and the complete resource catalogue.

The generated worker, code identity, runtime/source inventories and snapshot
must all describe the same final source tree. Do not reuse their predecessors'
hashes. These global release records are separate from the deterministic Mini
fragment; no private assembly script is an input to the Mini plan.

The source tree and authorized resources are reconstructible inputs. They are
not a prebuilt WordPress extension or a ready-to-run web archive.
