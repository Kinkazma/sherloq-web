// Private composition experiment. Unqualified reductions are explicitly tracked;
// this executor is not registered as a supported D2PRL browser detector.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createUnetGraph({graph, convolution, math, budget, loadParameter, layouts, pointLayouts, tailProbe = false, tailMode = 'lane16'}) {
  requireValue(graph.schema === 1 && graph.status === 'unqualified-experimental-graph' && same(graph.inputShape, [1, 3, 448, 448]), 'Fixed448 study graph required');
  let busy = false;
  return {
    async run(rgb, {signal, onNode} = {}) {
      if (busy) throw new EngineError('BUSY', 'UNet graph busy');
      requireValue(rgb instanceof Float32Array && rgb.length === 3 * 448 * 448, 'Prepared RGB448 required'); checkAbort(signal); busy = true;
      const values = new Map(), uses = new Map(), studyRoutes = [];
      const addUse = name => { if (name) uses.set(name, (uses.get(name) ?? 0) + 1); };
      graph.nodes.forEach(n => n.inputs.forEach(addUse)); addUse(graph.output);
      const set = (name, value) => { requireValue(!values.has(name), 'Duplicate graph value'); values.set(name, value); return value; };
      const drop = name => { const remaining = uses.get(name) - 1; uses.set(name, remaining); if (remaining === 0) { values.get(name)?.release(); values.delete(name); } };
      const parameter = async name => {
        if (!name) return null;
        if (values.has(name)) return values.get(name);
        const spec = graph.parameters[name]; requireValue(spec && ['float32', 'int64'].includes(spec.dtype), 'Unknown graph input');
        // Payload, digest copy, and transient network buffer are admitted before
        // the loader runs. Only the one retained tensor survives this admission.
        const transient = budget.reserve(3 * spec.bytes); let release;
        try {
          const data = await loadParameter(name, spec, {signal}); checkAbort(signal);
          requireValue(data.byteLength === spec.bytes && ((spec.dtype === 'float32' && data instanceof Float32Array) || (spec.dtype === 'int64' && data instanceof BigInt64Array)), 'Parameter payload');
          release = budget.reserve(spec.bytes); const result = set(name, {data, shape: spec.shape, release}); release = null; return result;
        } finally { transient(); release?.(); }
      };
      try {
        set(graph.input, {data: rgb, shape: graph.inputShape, release: budget.reserve(rgb.byteLength)});
        for (let index = 0; index < graph.nodes.length; index++) {
          checkAbort(signal); const node = graph.nodes[index], attrs = node.attributes, inputs = [];
          requireValue(node.outputs.length === 1, 'Single-output study graph');
          for (const name of node.inputs) inputs.push(await parameter(name));
          let result;
          if (node.op === 'Conv') {
            const [input, weight, bias] = inputs, [batch, channels, height, width] = input.shape, [outChannels, ci, kh, kw] = weight.shape;
            requireValue(batch === 1 && kh === kw && attrs.dilations.every(n => n === 1) && attrs.pads.every(n => n === attrs.pads[0]) && attrs.strides[0] === attrs.strides[1] && ci * attrs.group === channels, 'UNet convolution attributes');
            const name = node.inputs[1].replace(/^unet\./, '').replace(/\.weight$/, '');
            if (height === 1 && width === 1) {
              requireValue(kh === 1 && bias, 'Biased point convolution required');
              const mode = pointLayouts?.records.find(r => r.channels === channels && r.outChannels === outChannels)?.mode;
              if (pointLayouts) requireValue(pointLayouts.status === 'experimental-candidate' && [1, 2].includes(mode), 'Explicit point reduction layout');
              studyRoutes.push({name, reason: mode ? 'point-convolution-reference-order-study' : 'four-lane-reduction-probe', mode});
              result = await math.run(mode ? 'PointConvProbe' : 'PointConv4Probe', inputs, mode ? {mode} : {}, {signal});
            } else {
              const referenceLayout = layouts.records.find(r => r.name === name), experimentalBiasBefore = Boolean(bias && !referenceLayout);
              if (experimentalBiasBefore || ['encoder_stages.3.0.downsample.0', 'encoder_stages.4.0.downsample.0'].includes(name)) studyRoutes.push({name, reason: 'tail-convolution-reference-order-study', mode: tailProbe ? tailMode : 'ordered-before-probe'});
              const freeZero = bias ? null : budget.reserve(outChannels * 4);
              try {
                const unresolvedTails = {'encoder_stages.3.0.downsample.0': 768, 'encoder_stages.4.0.downsample.0': 192, 'decoder_stages.3.layer.1': 768, 'bottlenecks.0.seq.0': 768};
                result = await convolution.run({input: input.data, weights: weight.data, bias: bias?.data ?? new Float32Array(outChannels), channels, height, width, outChannels, kernel: kh, padding: attrs.pads[0], stride: attrs.strides[0], groups: attrs.group, hasBias: Boolean(bias), referenceLayout, experimentalBiasBefore, experimentalTailMode: tailMode, experimentalTailStart: tailProbe ? unresolvedTails[name] : undefined}, {signal});
              } finally { freeZero?.(); }
            }
          } else if (node.op === 'Concat') {
            const rank = inputs[0].shape.length;
            requireValue((rank === 1 && attrs.axis === 0) || (rank === 4 && attrs.axis === 1 && inputs.every(t => t.shape[0] === 1 && same(t.shape.slice(2), inputs[0].shape.slice(2)))), 'Supported contiguous concatenation');
            requireValue(inputs.every(t => t.data instanceof Float32Array), 'Float32 concatenation');
            const length = inputs.reduce((n, t) => n + t.data.length, 0), release = budget.reserve(length * 4);
            try {
              const data = new Float32Array(length); let at = 0;
              for (const input of inputs) { data.set(input.data, at); at += input.data.length; }
              const shape = [...inputs[0].shape]; shape[attrs.axis] = inputs.reduce((n, t) => n + t.shape[attrs.axis], 0); result = {data, shape, release};
            } catch (error) { release(); throw error; }
          } else if (node.op === 'Resize') {
            requireValue(attrs.mode === 'nearest' && attrs.coordinate_transformation_mode === 'asymmetric' && attrs.nearest_mode === 'floor' && !inputs[1] && same([...inputs[2].data], [1, 1, 2, 2]), 'Fixed nearest2 resize required');
            result = await math.run('Nearest2', [inputs[0]], {}, {signal});
          } else result = await math.run(node.op, inputs, attrs, {signal});
          set(node.outputs[0], result);
          await onNode?.({index, total: graph.nodes.length, node, result}); checkAbort(signal);
          node.inputs.filter(Boolean).forEach(drop);
        }
        const result = values.get(graph.output); requireValue(result && same(result.shape, [1, 1, 448, 448]), 'UNet output shape');
        values.delete(graph.output); return {...result, studyRoutes};
      } finally { for (const value of values.values()) value.release(); busy = false; }
    }
  };
}
