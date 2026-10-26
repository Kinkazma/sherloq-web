import {
  readOnnxGraph, onnxFields, onnxInput, onnxNode, onnxInitializer,
  replaceOnnxNodeInputs,
} from './onnx-scoped-graph.js';
import {requireValue} from './errors.js';

export const SELFDM_PROPOSAL_POINT_POST_SHA256 = '3fd09c58ac33fe73e374194e6aec029a88bf4bacede7a5c0369268fd4c7774a0';
export const SELFDM_PROPOSAL_POINT_OWNER_POLICY = 'selfdm-proposal-native-point-owner/2';
const P = '/sherloq/proposal_point_owner';
const encoder = new TextEncoder();
const concat = parts => {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  requireValue(Number.isSafeInteger(size), 'Proposal point graph size overflow');
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const varint = value => {
  let n = BigInt(value);
  const out = [];
  do { const b = Number(n & 127n); n >>= 7n; out.push(b | (n ? 128 : 0)); } while (n);
  return Uint8Array.from(out);
};
const field = (number, data) => concat([varint(number * 8 + 2), varint(data.length), data]);
const encodedNode = (opType, inputs, output, name) => onnxNode({
  opType, inputs, outputs: [output], name: P + '/' + name,
});
const outputRenamed = (raw, output) => concat(onnxFields(raw).flatMap(f =>
  f.number === 2 ? [field(2, encoder.encode(output))] : [f.raw]));

/**
 * Split the verified native post into per-owner native NMS without TopK,
 * ONE shared Top2048 and the per-owner native descriptor sampler. This does not produce RGB, gray or
 * descriptor atlases. No runtime registry or product admission is changed.
 * The caller verifies the source SHA and supplies admitted allocation first.
 */
export function buildSelfDMProposalPointOwnerGraph(bytes, stage, {budget} = {}) {
  requireValue(bytes instanceof Uint8Array && bytes.length === 13627 &&
    ['owner-nms', 'rank', 'sampler'].includes(stage) && typeof budget?.reserve === 'function',
  'Verified native Proposal point post, stage and allocation admission required');
  const free = budget.reserve(bytes.length + 524288);
  try {
    const graph = readOnnxGraph(bytes);
    requireValue(graph.nodes.length === 73 && graph.initializers.length === 38 &&
      JSON.stringify(graph.inputs) === JSON.stringify(['dense_scores', 'dense_descriptors']),
    'Pinned native Proposal post 73/38 topology required');
    for (const [index, name, op] of [
      [0, '/Shape', 'Shape'], [3, '/MaxPool', 'MaxPool'],
      [4, '/Equal', 'Equal'], [12, '/Equal_1', 'Equal'],
      [21, '/Equal_2', 'Equal'], [61, '/If', 'If'],
      [64, '/Cast_3', 'Cast'], [69, '/If_1', 'If'],
      [70, '/Unsqueeze_15', 'Unsqueeze'], [71, '/Unsqueeze_16', 'Unsqueeze'],
      [72, '/Unsqueeze_17', 'Unsqueeze'],
    ]) requireValue(graph.nodes[index].name === name && graph.nodes[index].opType === op,
      'Pinned native Proposal point operator required');

    const nodes = [], inputs = [], outputs = [], constants = [];
    const retained = [], byteIdentical = [], changed = [];
    const pushNative = (node, raw = node.raw, reason) => {
      nodes.push(raw); retained.push(node.name);
      if (raw === node.raw) byteIdentical.push(node.name);
      else changed.push({name: node.name, change: reason});
    };
    if (stage === 'owner-nms') {
      inputs.push(onnxInput('dense_scores', 1, [1, 1, 'scoreHeight', 'scoreWidth']),
        onnxInput('candidate_presence', 9, [1, 1, 'scoreHeight', 'scoreWidth']),
        onnxInput('proposal_descriptor_shape', 7, [4]));
      constants.push(onnxInitializer(P + '/absent', 1, [], Float32Array.of(-Infinity)));
      nodes.push(encodedNode('Where', ['candidate_presence', 'dense_scores', P + '/absent'],
        P + '/scores', 'admitted-scores'));
      for (let index = 0; index <= 56; index++) {
        const native = graph.nodes[index];
        if (index === 0) {
          pushNative(native, onnxNode({name: native.name, opType: 'Identity',
            inputs: ['proposal_descriptor_shape'], outputs: native.outputs}),
          'Exact native descriptor dimensions replace Shape only; no descriptor values');
          continue;
        }
        const scopedInputs = native.inputs.map(name => name === 'dense_scores' ? P + '/scores' : name);
        let raw = native.inputs.includes('dense_scores') ? replaceOnnxNodeInputs(native, scopedInputs) : native.raw;
        if ([4, 12, 21].includes(index)) {
          const temporary = P + '/native-maxima-' + index;
          raw = outputRenamed(raw, temporary);
          pushNative(native, raw, 'Native Equal attributes retained; output gated by candidate presence before propagation');
          nodes.push(encodedNode('And', [temporary, 'candidate_presence'], native.outputs[0], 'present-maxima-' + index));
        } else pushNative(native, raw, 'Dense score operand uses explicit admitted observations');
      }
      outputs.push(onnxInput('/Gather_5_output_0', 7, ['survivors', 2]),
        onnxInput('/Gather_6_output_0', 1, ['survivors']));
    } else if (stage === 'rank') {
      // The native If only carries opaque int64 row identities through Gather.
      // It never interprets these identities as positions or spatial neighbors.
      inputs.push(onnxInput('/Gather_5_output_0', 7, ['survivors', 2]),
        onnxInput('/Gather_6_output_0', 1, ['survivors']));
      for (let index = 57; index <= 61; index++) pushNative(graph.nodes[index]);
      outputs.push(onnxInput('/If_output_0', 7, ['count', 2]),
        onnxInput('/If_output_1', 1, ['count']));
    } else {
      // The input points are already selected by the ONE global native TopK.
      // Caller routes/translates those points to their owner and scatters the
      // descriptors back at the same selected indices without a new ranking.
      inputs.push(onnxInput('dense_descriptors', 1, [1, 256, 'coarseHeight', 'coarseWidth']),
        onnxInput('/Cast_3_output_0', 1, ['count', 2]));
      for (const index of [0, 1, 2, 26, 27, 65, 66, 67, 68, 69, 72]) pushNative(graph.nodes[index]);
      outputs.push(onnxInput('descriptors', 1, [1, 256, 'count']));
    }
    const parts = [
      ...nodes.map(raw => field(1, raw)),
      ...graph.fields.filter(f => ![1, 11, 12, 13].includes(f.number)).map(f => f.raw),
      ...constants.map(raw => field(5, raw)),
      ...inputs.map(raw => field(11, raw)), ...outputs.map(raw => field(12, raw)),
    ];
    const body = concat(parts);
    const out = concat(graph.modelFields.flatMap(f => f.number === 7 ? [field(7, body)] : [f.raw]));
    requireValue(out.length <= bytes.length + 524288, 'Proposal point cut exceeds admitted native allowance');
    let released = false;
    return {
      bytes: out,
      metadata: {
        policy: SELFDM_PROPOSAL_POINT_OWNER_POLICY,
        sourceSha256: SELFDM_PROPOSAL_POINT_POST_SHA256, stage,
        originalTopLevelInitializers: 38, allOriginalTopLevelInitializerPayloadsPreserved: true,
        retainedNativeSubgraphsByteIdentical: true,
        retainedNativeNodes: retained, byteIdenticalNativeNodes: byteIdentical, changedNativeNodes: changed,
        nativeMaxPoolCount: stage === 'owner-nms' ? 5 : 0,
        nativeTopKCount: stage === 'rank' ? 1 : 0,
        nativeOwnerCoordinates: true, oneSharedRankPerProposal: true,
        noRgbGrayOrDescriptorFillRaster: true,
        noAdditionalRankingNormalizationOrMatching: true, nativeBackendUnchanged: true,
        qualification: 'structural cut only; native numerical reception and source producers remain open',
      },
      release() { if (!released) { free(); released = true; } },
    };
  } catch (error) { free(); throw error; }
}
