# Median detector development references

Current scope, API, corpus and limitations are in [MEDIAN.md](MEDIAN.md).
The completed CPU path includes the local JSON reader, bounded feature workers,
raw grids, native display/decisions, view cache and cancellation. Three-browser
functional proofs are median-{chrome,firefox,webkit}-proof.json.

The initial 2084-vector arithmetic investigation found exact float32 margins and
four expf rounding differences (maximum 3.725290298461914e-9), unchanged by trying
portable C expf. No exception table was introduced. Reproduce it with
scripts/generate-median-arithmetic.py and scripts/verify-median-arithmetic.mjs,
using the existing local checkpoint. Split-boundary vectors stay in excluded
.build; only aggregate evidence ships. The final feature WASM heap is fixed 16MiB.
