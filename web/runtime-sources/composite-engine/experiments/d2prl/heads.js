// Experimental complete head composition. No native activation substitution.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
export function createHeads({unionHead, unet, math, roles, budget}) {
  let busy = false;
  return {
    async run({rgb, patchmatch}, {signal, onStage, onUnetNode} = {}) {
      if (busy) throw new EngineError('BUSY', 'D2PRL heads busy');
      requireValue(rgb instanceof Float32Array && rgb.length === 3 * 448 ** 2, 'Prepared RGB448 required'); checkAbort(signal); busy = true;
      const held = new Set(); let borrowed, complete = false, resultRelease;
      const keep = value => { held.add(value); return value; }, free = value => { value.release(); held.delete(value); };
      try {
        borrowed = budget.reserve(rgb.byteLength + 8 * 448 ** 2 * 4);
        const dedicated = keep(await unionHead.run(patchmatch, {signal, onStage})), general = keep(await unet.run(rgb, {signal, onNode: onUnetNode}));
        await onStage?.('unet-sigmoid', general.data);
        const product = keep(await math.run('Mul', [dedicated, general], {}, {signal})), overlap = keep(await math.run('SumAll', [product], {referenceThreads: 8}, {signal}));
        free(product); const total = keep(await math.run('SumAll', [general], {referenceThreads: 8}, {signal}));
        const decision = {overlap: overlap.data[0], threshold: Math.fround(total.data[0] * 0.5)}; decision.combineMaximum = decision.overlap > decision.threshold;
        free(overlap); free(total);
        const union = decision.combineMaximum ? keep(await math.run('Max', [dedicated, general], {}, {signal})) : dedicated;
        if (union !== dedicated) free(dedicated); free(general); await onStage?.('combined-union', union.data);
        const result = keep(await roles.run({rgb, coordinates: patchmatch.coordinates, union: union.data}, {signal}));
        await onStage?.('target', result.target); await onStage?.('source', result.source); checkAbort(signal);
        held.delete(union); held.delete(result); let released = false;
        resultRelease = () => { if (released) return; released = true; union.release(); result.release(); }; complete = true;
        return {union: union.data, target: result.target, source: result.source, decision, roleRuntime: {heapCapacityBytes: result.heapBytes ?? null, ort: result.ort}, release: resultRelease};
      } finally { for (const value of held) value.release(); borrowed?.(); if (!complete) resultRelease?.(); busy = false; }
    }
  };
}
