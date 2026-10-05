# Panneaux + Texte + true reflections:96 MP qualification

`scripts/generate-m3-96mp-panels.py` builds a12000×8000 public deterministic RGB
noise image with three3840×7840 panels, white gutters and black text on white
regions. Two panels share a copied field; the third is its true horizontal mirror.
No image-wide downsampling is introduced. The native algorithm uses independent
panels and their enclosing search region, then its true reflected-pixel pass.

Chrome154,2 workers,6 GiB: SIFT + G2NN + RANSAC + Panels + Text completed in
573.155s including38.013s load, with peak5,213,432,568 accounted bytes. It detects
all three intended panel rectangles, creates29 text exclusion boxes from54 useful
Tesseract tiles (74.213s), and returns72,000 point rows /7,817 pairs /22 groups.
`total_features`90155 is the native detection count, not the returned point count.
OCR runs once; detection/matching/grouping counters are2 because true reflections
require the second native search. Cached visibility changes preserve these counts.

Original-sized windows, alternate hidden-group view,36,460,349-byte NPZ and
197,778,983-byte PNG complete; memory releases to zero. Native drawing of exported
point/pair/model arrays matches all288,000,000 PNG bytes. Native OCR and numerical
pipeline behavior are qualified separately on the smaller existing corpora; the
large run exercises actual OCR, panels, reflections, global matching, groups and
exports. It is not a claim to have rerun the entire96 MP native neural/OCR pipeline.

The source SHA and full stage details are in
`m3-sparse-96mp-sift-g2nn-ransac-panels-text-webgpu-proof.json`; the drawing proof is
`m3-96mp-sparse-export-sift-g2nn-ransac-panels-text-proof.json`.
