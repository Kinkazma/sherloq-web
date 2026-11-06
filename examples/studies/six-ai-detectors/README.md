# Study data and supplementary files

[← SHERLOQ Web](../../../README.md#ai-image-detection)

[Read the complete study](Comparative%20evaluation%20of%20AI-generated%20image%20detectors%20%E2%80%93%20DDA%20-%20GAPL%20-%20SPAI%20-%20PRL%20-%20Community%20Forensics%20384%20-%20B-Free.pdf).

## Image dataset

[![Download the image dataset](download-dataset.svg)](https://mega.nz/#P!AgFusABYlFI3lAXSDhlIehf-al7ttN5o0N2BJO630YpyTNLdxypSVlB1IKTO9-IgXf8V2SGGAuDTSzarJgl4B_J1HOWOI9f0TTqc-r7rvtGPsC7ghaZQZfKpuY0Q1u8i-wDRb9HxQ3A)

**Dataset link:** <https://mega.nz/#P!AgFusABYlFI3lAXSDhlIehf-al7ttN5o0N2BJO630YpyTNLdxypSVlB1IKTO9-IgXf8V2SGGAuDTSzarJgl4B_J1HOWOI9f0TTqc-r7rvtGPsC7ghaZQZfKpuY0Q1u8i-wDRb9HxQ3A>  
**Password:** `RjJhix6eQfy&`

## Recorded results

- [Individual detector results — CSV](donnees/predictions.csv) · [JSON Lines](donnees/predictions.jsonl)
- [Image identities, dimensions and grouping](donnees/images.json)
- [Central table — PDF](Central-table-six-AI-image-detectors.pdf) · [CSV](donnees/tableau-central.csv) · [JSON](donnees/tableau-central.json)
- [Results by condition](donnees/resultats-globaux.json)
- [Paired comparisons, intervals and detailed statistics](donnees/resultats-recalcules.json)
- [Numerical verification record](donnees/verification.json)

## Recompute the statistics

The [script](reproduce_statistics.py) reads the supplied measurements and verifies the recomputed comparisons against the reference values. It does not rerun the detectors. Dependencies are listed in [requirements-statistics.txt](requirements-statistics.txt).

```bash
python reproduce_statistics.py --output recomputed-results
```

The image catalogue identifies the 666 files by SHA256 and keeps related versions in the same source family. Images are not embedded in these numerical files.
