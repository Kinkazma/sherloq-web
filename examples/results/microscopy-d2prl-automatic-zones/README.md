# D2PRL — automatic microscopy zones, minimum 100 and 10

The web engine detected 16 panels and analyzed each independently, plus one enclosing global search. The recorded execution order is the global pass first, then panels 1–16. The global rectangle is `[0, 92, 3226, 930]` in half-open original coordinates; it includes the panels and gaps, and excludes the caption above them. The source image remains 3226 × 936 pixels.

All 17 passes use the published web engine `0.35.0-export.2`, its existing D2PRL model, 448 × 448 grids, 40 iterations and seed 22. The execution backend is WebGPU convolutions with WebAssembly workers. Minimum component sizes are **100 and 10 model-grid pixels**. Each region is resized to the model grid, so the same component-size setting corresponds to different original-image areas in a local pass and the global pass. These are example settings, not changes to the application default.

The 100-pixel masks were exported from the engine. Its shipped postprocessor and zone projector were then run on the saved raw grids: the reconstructed 100-pixel masks match the exports byte for byte, and the 10-pixel masks retain every pixel selected at 100. This refiltering performs **zero additional neural inferences**.

The combined masks were exported by the shipped web zone projector from all 17 cached grids, at each minimum. They match the Boolean OR of the independent masks byte for byte, following the automatic workflow’s one-model-union rule. It is a direct-engine illustration, not an application screenshot. Yellow is a uniform 35% overlay on filtered mask pixels. The blue/orange zone outlines and crop labels are presentation annotations, not model outputs.

[Input and provenance](../../microscopy/provenance.json) · [Full run record](result.json) · [Main presentation](../../../README.md#featured-example--d2prl-across-automatic-microscopy-zones)

## Views

| View | Lossless full-resolution file | Lightweight preview |
| --- | --- | --- |
| Automatic panel rectangles in blue; enclosing search rectangle in orange. These are search areas, not detections. | [PNG](automatic-zones.png) | [WebP](automatic-zones.webp) |
| Union of 16 independent panel masks, minimum 100 model-grid pixels | [PNG](local-detections-100.png) | [WebP](local-detections-100.webp) |
| Enclosing-zone mask, minimum 100 model-grid pixels | [PNG](global-detections-100.png) | [WebP](global-detections-100.webp) |
| Boolean union of local and enclosing-zone masks; minimum 100; one D2PRL vote per pixel | [PNG](combined-detections-100.png) | [WebP](combined-detections-100.webp) |
| Union of 16 independent panel masks, minimum 10 model-grid pixels | [PNG](local-detections-10.png) | [WebP](local-detections-10.webp) |
| Enclosing-zone mask, minimum 10 model-grid pixels | [PNG](global-detections-10.png) | [WebP](global-detections-10.webp) |
| Boolean union of local and enclosing-zone masks; minimum 10; one D2PRL vote per pixel | [PNG](combined-detections-10.png) | [WebP](combined-detections-10.webp) |
| Local panel panel-01: identical input crop, minimum 100, minimum 10. Selected as the panel with the most additional original-coordinate pixels at minimum 10. | [PNG](threshold-detail.png) | [WebP](threshold-detail.webp) |

## Mask counts

Counts below are selected pixels in the original image coordinates; the minimum filter itself is applied on each 448 × 448 model grid.

| Minimum | Local union | Global | Overlap | Combined union |
| --- | ---: | ---: | ---: | ---: |
| 100 | 82157 | 694828 | 36694 | 740291 |
| 10 | 95401 | 699644 | 41275 | 753770 |

## Independent masks

White pixels are selected; black pixels are unselected. Each mask uses the full source-image dimensions, so its spatial position is preserved.

| Search | Minimum 100 | Minimum 10 |
| --- | --- | --- |
| global-zone | [694828 pixels](global-zone-mask.png) | [699644 pixels](global-zone-mask-10.png) |
| panel-01 | [18558 pixels](panel-01-mask.png) | [20420 pixels](panel-01-mask-10.png) |
| panel-02 | [5597 pixels](panel-02-mask.png) | [7112 pixels](panel-02-mask-10.png) |
| panel-03 | [8178 pixels](panel-03-mask.png) | [9723 pixels](panel-03-mask-10.png) |
| panel-04 | [8388 pixels](panel-04-mask.png) | [9737 pixels](panel-04-mask-10.png) |
| panel-05 | [10536 pixels](panel-05-mask.png) | [12080 pixels](panel-05-mask-10.png) |
| panel-06 | [16267 pixels](panel-06-mask.png) | [17910 pixels](panel-06-mask-10.png) |
| panel-07 | [11230 pixels](panel-07-mask.png) | [12494 pixels](panel-07-mask-10.png) |
| panel-08 | [872 pixels](panel-08-mask.png) | [1320 pixels](panel-08-mask-10.png) |
| panel-09 | [120 pixels](panel-09-mask.png) | [364 pixels](panel-09-mask-10.png) |
| panel-10 | [391 pixels](panel-10-mask.png) | [668 pixels](panel-10-mask-10.png) |
| panel-11 | [653 pixels](panel-11-mask.png) | [873 pixels](panel-11-mask-10.png) |
| panel-12 | [284 pixels](panel-12-mask.png) | [561 pixels](panel-12-mask-10.png) |
| panel-13 | [211 pixels](panel-13-mask.png) | [578 pixels](panel-13-mask-10.png) |
| panel-14 | [324 pixels](panel-14-mask.png) | [597 pixels](panel-14-mask-10.png) |
| panel-15 | [407 pixels](panel-15-mask.png) | [663 pixels](panel-15-mask-10.png) |
| panel-16 | [141 pixels](panel-16-mask.png) | [301 pixels](panel-16-mask-10.png) |

## Reproduction

Restore the locked web runtime as described in [BUILD](../../../docs/BUILD.md), then run from the repository root:

```sh
node scripts/generate-d2prl-microscopy.mjs
node scripts/refilter-d2prl-microscopy.mjs
python3 scripts/render-d2prl-microscopy.py
```

The scripts require the same Chrome/Playwright setup as the existing worker examples; rendering also needs Pillow and NumPy. Outputs go into `scripts/results/microscopy-d2prl-automatic-zones`. The raw grids stay available locally for further refiltering. Their SHA-256 hashes are recorded per pass.
