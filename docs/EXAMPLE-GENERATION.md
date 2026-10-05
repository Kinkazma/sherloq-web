# Generate illustrative outputs directly from the web engine

The gallery uses the same scientific code, model assets and presentation routines as the web application. It does not simulate results or paint detection regions by hand. Whole input images retain their original dimensions; a model's own defined input geometry remains part of that algorithm.

Some tools run directly in Node.js. Tools that require Web Workers use the shipped computational clients in a headless Chrome runtime. No application interface, menus or screenshots are involved in those batch calls.

First [restore the locked resource files](BUILD.md). Install the generator dependency with `npm ci --prefix web/engine-source`; the worker runner uses an installed Google Chrome. Then, from this repository root:

```sh
node scripts/generate-worker-examples.mjs
```

The job list is [example-worker-jobs.json](../scripts/example-worker-jobs.json). A custom JSON list can be passed as the first argument, relative to `scripts/`. Jobs run sequentially in fresh browser contexts. Each job has a 15-minute timeout and an 8 GiB computational budget; actual physical memory also includes runtime overhead. Sources are served only on loopback. No input image is uploaded.

Node jobs are described in [example-node-jobs.json](../scripts/example-node-jobs.json). Pass one complete job object as a JSON argument to `scripts/generate-node-example.mjs`. The ELA energy overlay uses the application's own `energy-render.js`.

Outputs and metadata are written beneath `scripts/results/`; status files report failures separately. PNG encoding is lossless. Job records retain the input, parameters, CPU backend, engine identity and hashes. Preview images in the README are display reductions only. The full-resolution outputs remain available alongside them.

These examples help readers understand the tools. They are not a contract for every future version, input or platform. A highlighted area can extend beyond a known edit, and a detector can miss an edit. Upstream desktop screenshots are attributed separately and are not presented as web-engine results.
