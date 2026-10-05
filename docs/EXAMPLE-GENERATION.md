# Generate illustrative outputs directly from the web engine

The gallery calls the shipped scientific code and model assets directly. Tool-client views use the application’s presentation routines; the additional probability overlay and numeric charts are recorded display derivatives of actual outputs. No detection regions are painted by hand. Whole input images retain their original dimensions; a model's own defined input geometry remains part of that algorithm.

Some tools run directly in Node.js. Tools that require Web Workers use the shipped computational clients in a headless Chrome runtime. No application interface, menus or screenshots are involved in those batch calls.

First [restore the locked resource files](BUILD.md). Install the generator dependency with `npm ci --prefix web/engine-source`; the worker runner uses an installed Google Chrome. Then, from this repository root:

```sh
node scripts/generate-worker-examples.mjs
```

The job list is [example-worker-jobs.json](../scripts/example-worker-jobs.json). A custom JSON list can be passed as the first argument, relative to `scripts/`. Jobs run sequentially in fresh browser contexts. The default list contains the successful worker jobs shown in the gallery. Each job has a 15-minute timeout by default (adjustable with `SHERLOQ_EXAMPLE_TIMEOUT_MS` or a job’s `timeoutMs`) and an 8 GiB computational budget; actual physical memory also includes runtime overhead. Sources are served only on loopback. No input image is uploaded.

Node jobs are described in [example-node-jobs.json](../scripts/example-node-jobs.json). Pass one complete job object as a JSON argument to `scripts/generate-node-example.mjs`. The ELA energy overlay uses the application's own `energy-render.js`.

Outputs and metadata are written beneath `scripts/results/`; status files report failures separately. PNG encoding is lossless. Job records retain the input, parameters, requested backend, engine identity and hashes. Preview images in the README are display reductions only. The full-resolution outputs remain available alongside them.

These examples help readers understand the tools. They are not a contract for every future version, input or platform. A highlighted area can extend beyond a known edit, and a detector can miss an edit. Upstream desktop screenshots are attributed separately and are not presented as web-engine results.

Long model jobs use their recorded CPU/GPU selection and worker limit; these are execution settings, not changed detector parameters. `energyLayers` adds the low/high energy-score views, using the same clamped red-channel scale as the automatic presentation.

The multiple-compression examples are numeric charts of actual engine values. Generate them with `node scripts/generate-jpeg-examples.mjs`, then run `python3 scripts/render-jpeg-examples.py` (requires Matplotlib and Pillow). The recompression curve and aligned double-JPEG scores are separate methods; neither supplies a count of past saves.

For the Forgeryscope figure, `node scripts/generate-forgeryscope-example.mjs` calls the public engine component used by automatic analysis and exports separate final/candidate/geometric overlays. For D2PRL, run `python3 scripts/render-d2prl-overlay.py` after inference to add the probability-weighted yellow display; the original grayscale probability output remains available.

`python3 scripts/render-pixel-details.py` magnifies six recorded candidate locations after the pixel-defect job. It uses nearest-neighbor display of the original pixels and the existing detector overlay; no new marker is painted onto the source.
