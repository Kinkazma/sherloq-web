# Validation scope and optimization priorities

## Resource integrity

Publication preparation independently checked SHA-256 and size for every one of the 4,224 pieces and streamed reconstruction hashes for all 5,237 original resources. All passed. Every file in the supplied public tree is at most 100,000,000 bytes.

## Independent interface checks

After reconstructing the locked resources in a separate local copy, all 142 Node tests passed. The public source alone intentionally omits the large runtime files until reconstruction; running the tests before restoration is incomplete. [Result](evidence/publication-node-tests.json).

## Supplied browser evidence

The following records were supplied with the interface delivery, rather than rerun as part of the documentation work:

- [Chrome 154](evidence/browser-chrome-proof.json)
- [Firefox 155](evidence/browser-firefox-proof.json)
- [WebKit 26.6](evidence/browser-webkit-proof.json)

Each record uses two distinct local origins, a fresh automated browser context and synthetic 67 × 65 pixels. It checks a real engine/export path, an exact range of a model spanning two 100 MB pieces, a local library without the remote server, and an ordinary TAR independently checked with Python. The startup measurement is 2,363,985 bytes and zero remote requests in each record.

These checks do not establish accuracy across all algorithms, compatibility with every WordPress deployment, arbitrary image sizes, physical mobile devices, or actual public-origin delivery. Public-origin headers, bytes and browser behavior require their own check. Scientific qualification in the engine documents remains limited to its declared inputs, configurations and comparisons.

## Where I would optimize first

1. Measure cold and cached execution separately on the same images and settings, retaining outputs and hardware/browser details.
2. Profile model initialization, CPU/GPU transfer and repeated allocations before changing arithmetic or model graphs.
3. Check memory retained after closing documents, cache eviction, worker recovery and cancellation of long computations.
4. Measure large exports and local-library reconstruction with slow disks and constrained browser storage.
5. Compare scientific arrays and masks after each optimization; faster display alone does not establish faster inference or better accuracy.

Two concurrent downloads and 128 MiB of admitted payload bound transport scheduling. They do not bound total browser memory. Cached resources may be evicted; an independently saved ordinary-file library avoids relying exclusively on browser cache persistence.
