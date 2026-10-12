# VIG mapped readback lifetime repair

The first real fourteen-method batch reached thirteen complete results; VIG failed with `Float32Array.set` on a detached buffer in `vig-backbone.js` while copying the next BatchNorm input. This was a lifetime error, not a Wasm growth or model allocation refusal. The common general GPU convolution returns a view of its mapped readback, whose buffer is detached by `release()`/unmap. VIG kept `result.data`, released its owner, and only afterwards attempted to use that view.

VIG now retains that owner across the intervening parameter awaits. The following native math operation performs its existing useful input copy into Wasm and then retires the mapping immediately. It does not add another activation copy, keep a whole history of GPU outputs, change convolution/BatchNorm/GELU arithmetic, or substitute a CPU computation for the selected GPU convolution. Exceptions and cancellation retire any unconsumed mapping; cleanup errors are attached to the primary failure.

Other current consumers were checked: TNT linear explicitly transposes into an owned host tensor before release; its attention helper copies/reorders mapped slices into its owned output. VIG graph distance similarly produces an owned host tensor. CMSeg retains result owners in its graph value/use-count map until their final consumer or error cleanup. These paths do not reproduce the VIG alias-after-release defect and are not changed by this repair.

`tests/vig-mapped-lifetime.test.mjs` uses actual ArrayBuffer detachment and the actual compiled VIG math module. The former release-before-copy sequence throws the same TypeError. The corrected executor carries two representative mapped convolution outputs through its real BN/GELU consumers and produces exactly the same Float32 bytes as independently owned host outputs. Parameter failures, cancellation and cleanup-error preservation return reservations. These transport tests use explicit convolution doubles; they are not claims of a full model inference or a real GPU shader qualification.

Validation command:

    node --test tests/vig-mapped-lifetime.test.mjs tests/vig-backbone-admission.test.mjs tests/vig-math.test.mjs tests/d2prl-gpu-owned-output.test.mjs

Twenty tests pass, including the independent native VIG arithmetic fixtures for convolution, GELU/exp, distance, tied TopK and graph gather. No model, parameter file, runtime binary or numerical kernel changes. The application task separately repeats the actual browser batch after staging this lifetime repair.
