# Display equalization

[← SHERLOQ Web](../../README.md#display-equalization)

The same microscopy crop is shown with each method, using the existing SHERLOQ image-adjustment pipeline. These are display adjustments; the source and detector inputs remain unchanged.

## Original, CLAHE, CLAHE + gamma and AHE

| Original | CLAHE | CLAHE + gamma | AHE |
| --- | --- | --- | --- |
| ![Original](images/original.webp) | ![CLAHE](images/clahe.webp) | ![CLAHE + gamma](images/clahe-gamma.webp) | ![AHE](images/ahe.webp) |
| Unadjusted | Contrast limit: 5 | Contrast limit: 5 · Gamma: 5 | Tiles per axis: 8 |

CLAHE + gamma uses the same CLAHE setting and the global-adjustment gamma value 5 (50 in its input field).

## Other methods

Expand a group to compare its results. Each image keeps the same coordinates and native 189 × 131 pixel dimensions.

<details>
<summary>Histogram and bi-histogram methods</summary>

| Histogram | BBHE |
| --- | --- |
| ![Histogram](images/histogram.webp) | ![BBHE](images/bbhe.webp) |
| Intensity: 100% | Intensity: 100% |

| DSIHE | MMBEBHE |
| --- | --- |
| ![DSIHE](images/dsihe.webp) | ![MMBEBHE](images/mmbebhe.webp) |
| Intensity: 100% | Intensity: 100% |

</details>

<details>
<summary>Recursive and weighted methods</summary>

| RMSHE | RSIHE |
| --- | --- |
| ![RMSHE](images/rmshe.webp) | ![RSIHE](images/rsihe.webp) |
| Depth: 2 | Depth: 2 |

| RSWHE-M | RSWHE-D |
| --- | --- |
| ![RSWHE-M](images/rswhe-m.webp) | ![RSWHE-D](images/rswhe-d.webp) |
| Depth: 2 · mean split | Depth: 2 · median split |

| WTHE |
| --- |
| ![WTHE](images/wthe.webp) |
| Weighting exponent: 0.5 |

</details>

<details>
<summary>Dynamic and exposure-based methods</summary>

| DHE | BPDHE |
| --- | --- |
| ![DHE](images/dhe.webp) | ![BPDHE](images/bpdhe.webp) |
| Count emphasis: 0 | Histogram smoothing σ: 1.0762 |

| ESIHE |
| --- |
| ![ESIHE](images/esihe.webp) |
| Clip factor: 1 |

</details>

<details>
<summary>Contextual contrast and adaptive gamma</summary>

| CVC | AGCWD |
| --- | --- |
| ![CVC](images/cvc.webp) | ![AGCWD](images/agcwd.webp) |
| Neighbourhood: 7 px | Weighting α: 0.5 |

</details>

DHE and BPDHE are experimental digital reconstructions. [Method conventions and original references](METHODS.md).

## Image source

Reinehr et al., *Scientific Reports* **8**, 9821 (2018), Figure 4A (page 6, third image in the upper row). [Archived PDF](sources/reinehr-2018-s100b/s41598-018-28183-6.pdf#page=6) · [Original article](https://doi.org/10.1038/s41598-018-28183-6) · [Full attribution and CC BY 4.0 licence](sources/reinehr-2018-s100b/README.md).

The examples show a crop and the named display adjustments. The archived PDF is unchanged.
