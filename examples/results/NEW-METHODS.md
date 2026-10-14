# Additional web-engine examples

These outputs illustrate added method families using the [three-cell input](../three-cells/provenance.json) and the already supplied [microscopy figure](../microscopy/provenance.json). The three-cell input is analyzed at 416 × 320; the figure remains 3226 × 936. No edit-reference image is used as detector input. The model's own preparation and projection are recorded in each run.

The [batch jobs](../../scripts/example-clone-jobs.json) identify the exact source commit, parameters, backend and search regions. [Generation procedure](../../docs/EXAMPLE-GENERATION.md#additional-clone-methods-and-text-preparation). Methods retain their authors and component terms: [credits](../../docs/ATTRIBUTION.md), [resource notices](../../docs/METHODS-RESOURCE-LICENSES.txt).

Native matching displays use **Biomes only**: areas on, circles, connecting lines and centre points off. Envelopes show the two sets of accepted matched points; they are not pixel-level edit masks. SSG's area view instead retains its own native SSIM mask. No result is a guarantee that every edit has been found.

## CMSeg-Net and MGCFDN

[Comparison plate](three-cells-localization/comparison.png).

| Method | Native overlay | Unfiltered map | Mask | Run record |
| --- | --- | --- | --- | --- |
| CMSeg-Net generalization | [PNG](three-cells-cmseg-generalization/overlay.png) | [PNG](three-cells-cmseg-generalization/map.png) | [PNG](three-cells-cmseg-generalization/mask.png) | [JSON](three-cells-cmseg-generalization/result.json) |
| MGCFDN | [PNG](three-cells-mgcfdn/overlay.png) | [PNG](three-cells-mgcfdn/map.png) | [PNG](three-cells-mgcfdn/mask.png) | [JSON](three-cells-mgcfdn/result.json) |

Both runs analyze the entire image. CMSeg-Net uses its defined 512 × 512 model input; MGCFDN uses 256 × 256. Maps are projected to original coordinates. The recorded mask threshold is strictly greater than 0.5. Bright responses include the repeated cells and some surrounding boundaries; no pixel-level reference mask was supplied for measuring accuracy.

## SelfDM

[Comparison plate](three-cells-selfdm/comparison.png).

| Stage | Native overlay | Unfiltered map | Mask | Run record |
| --- | --- | --- | --- | --- |
| Initial map | [PNG](three-cells-selfdm-map/overlay.png) | [PNG](three-cells-selfdm-map/map.png) | [PNG](three-cells-selfdm-map/mask.png) | [JSON](three-cells-selfdm-map/result.json) |
| Complete experimental pipeline | [PNG](three-cells-selfdm-proposal/overlay.png) | [PNG](three-cells-selfdm-proposal/map.png) | [PNG](three-cells-selfdm-proposal/mask.png) | [JSON](three-cells-selfdm-proposal/result.json) |

The initial map uses the model's 512 × 512 preparation. The complete pipeline returns its final map and mask at the original 416 × 320 geometry. It also responds to background areas between and beside the cells; those responses remain visible in the plate. This example uses pinned models imported locally. Their bytes are not included with the example outputs.

## XFeat and ALIKED

[Comparison plate](three-cells-learned-biomes/comparison.png).

| Method and search | Native Biomes | Geometric data | Run record |
| --- | --- | --- | --- |
| XFeat + LighterGlue — two selected regions | [PNG](three-cells-xfeat-pair/result.png) | [JSON](three-cells-xfeat-pair/matches.json) | [JSON](three-cells-xfeat-pair/result.json) |
| ALIKED + LightGlue — full image | [PNG](three-cells-aliked/result.png) | [JSON](three-cells-aliked/matches.json) | [JSON](three-cells-aliked/result.json) |

XFeat's example is a guided comparison. Its rectangles are `[48,48,166,136]` and `[213,180,317,268]`, in original pixel coordinates, with the right and bottom bounds exclusive. The method is not asked to discover those regions. ALIKED searches the full frame. Both use affine verification and the native Biomes presentation; see the records for descriptor and geometric thresholds.

## EfficientLoFTR

[Comparison plate](three-cells-efficient-loftr/comparison.png) · [Native Biomes](three-cells-efficient-loftr/result.png) · [Geometric data](three-cells-efficient-loftr/matches.json) · [Run record](three-cells-efficient-loftr/result.json).

The method compares the same two explicit rectangles used for the XFeat comparison, with model long side 832 and no extra rotation or reflection pass. It maps its matches back to original coordinates. The two colored envelopes locate accepted keypoints within the selected cells; they do not claim the full boundary of a pasted object.

## SSG

[Comparison plate](three-cells-ssg/comparison.png) · [Native area view](three-cells-ssg/result.png) · [Geometric data](three-cells-ssg/matches.json) · [Run record](three-cells-ssg/result.json).

The full-frame run sets `normalizationLongEdge` to 0 to retain the original resolution. Other recorded settings include minimum distance 50, spatial K 3, ratio 0.6 and mask threshold 0.4. Its structured-edge and spatial-phrase correspondences feed the native SSIM localization. The red area extends beyond the cell boundaries; circles and connecting lines are disabled.

## PP-OCRv6

[Annotated native proposals](microscopy-ppocrv6/result.png) · [Polygons and run record](microscopy-ppocrv6/result.json).

The supplied scientific figure is processed with the shipped text-preparation client in text-only mode. The renderer draws each returned polygon as a red three-pixel outline over the unchanged image. The proposals mostly surround panel labels; a vertical gap is also proposed. These regions require review before using them as exclusions. There is no text recognition, manual correction of polygons or detector claim about the figure's scientific content.

## Scientific fields and presentation

Segmentation directories also contain `map.f32` and `mask.f32`. They are original-coordinate projected fields serialized as little-endian Float32 arrays, with dimensions and SHA-256 hashes in each run record. The mask's float values encode zero or one; model-grid sizes and interpolation rules are recorded separately. These files are distinct from the compressed preview and from the model weights.

PNG outputs remain lossless. Comparison plates only add captions and arrange native rasters. WebP previews are lossy display derivatives, each at most 500,000 bytes; their dimensions, source hashes, byte counts and compression settings are recorded in the [preview manifest](../../screenshots/readme-webp/manifest.json). Click a README preview to open its lossless original.
