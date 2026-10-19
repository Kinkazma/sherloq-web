#!/usr/bin/env python3
"""Split RITA at exact native operator boundaries for global M2 execution.

Row windows retain local receptive-field halos; every attention query still
uses the full key/value bank. No image or feature is resized for inference.
Small ONNX graphs each own their learned weights; the graph catalogue contains
no duplicated full model. This is a local preparation, not publication.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
import onnx
from onnx import numpy_helper


class Patch(nn.Module):
    def __init__(self, layer, embedding=None):
        super().__init__()
        self.conv, self.norm, self.embedding = layer.proj, layer.norm, embedding

    def forward(self, x, iteration=None):
        x = F.conv2d(x, self.conv.weight, self.conv.bias,
                     stride=self.conv.stride, padding=(0, self.conv.padding[1]))
        b, c, h, w = x.shape
        x = self.norm(x.flatten(2).transpose(1, 2))
        if self.embedding is not None:
            x = x + self.embedding(iteration).unsqueeze(1)
        return x.transpose(1, 2).reshape(b, c, h, w)


class KeyValues(nn.Module):
    def __init__(self, block):
        super().__init__()
        self.norm, self.attn = block.norm1, block.attn

    def forward(self, x):
        b, c, h, w = x.shape
        t = self.norm(x.flatten(2).transpose(1, 2))
        if self.attn.sr_ratio > 1:
            x = self.attn.sr(t.transpose(1, 2).reshape(b, c, h, w))
            h, w = x.shape[2:]
            t = self.attn.norm(x.flatten(2).transpose(1, 2))
        return self.attn.kv(t).transpose(1, 2).reshape(b, 2*c, h, w)


class Query(nn.Module):
    def __init__(self, block):
        super().__init__()
        self.norm, self.attn = block.norm1, block.attn

    def forward(self, x, key, value):
        b, c, h, w = x.shape
        t = x.flatten(2).transpose(1, 2)
        heads = self.attn.num_heads
        q = self.attn.q(self.norm(t)).reshape(b, -1, heads, c//heads).permute(0, 2, 1, 3)
        weights = ((q @ key) * self.attn.scale).float().softmax(-1)
        result = t + self.attn.proj((weights @ value).transpose(1, 2).reshape(b, -1, c))
        return result.transpose(1, 2).reshape(b, c, h, w)


class Mlp(nn.Module):
    def __init__(self, block):
        super().__init__()
        self.norm, self.mlp = block.norm2, block.mlp

    def forward(self, x):
        b, c, h, w = x.shape
        t = x.flatten(2).transpose(1, 2)
        return (t + self.mlp(self.norm(t), h, w)).transpose(1, 2).reshape(b, c, h, w)


class Norm(nn.Module):
    def __init__(self, layer):
        super().__init__()
        self.layer = layer

    def forward(self, x):
        return self.layer(x.flatten(2).transpose(1, 2)).transpose(1, 2).reshape_as(x)


class Fusion(nn.Module):
    def __init__(self, layer):
        super().__init__()
        self.layer = layer

    def forward(self, x, g):
        return self.layer(x, g)


class Head(nn.Module):
    def __init__(self, layer):
        super().__init__()
        self.layer = layer

    def forward(self, c1, c2, c3, c4, c5, c6, c7, c8):
        return self.layer(torch.cat((c1, c2, c3, c4, c5, c6, c7, c8), dim=1))


class Final(nn.Module):
    def forward(self, pred, grid):
        return F.grid_sample(pred, grid, mode='bilinear', padding_mode='border', align_corners=True)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(1024*1024), b''):
            h.update(part)
    return h.hexdigest()


def export(output, name, module, args, inputs, assets, dynamic=None):
    path = output / (name + '.onnx')
    module.eval()
    with torch.inference_mode():
        torch.onnx.export(module, tuple(args), str(path), input_names=inputs,
            output_names=['result'], opset_version=19, dynamo=False, external_data=False,
            do_constant_folding=False,
            dynamic_axes=dynamic if dynamic is not None else {
                key: {2: key+'_height', 3: key+'_width'} for key in [*inputs, 'result']})
    # Match the existing M2 segmentation export: fold literal Cast only, never
    # fuse trained normalization or replace arithmetic with approximations.
    graph = onnx.load(path)
    values = {tensor.name: numpy_helper.to_array(tensor) for tensor in graph.graph.initializer}
    nodes = []
    for node in graph.graph.node:
        if node.op_type == 'Constant':
            tensor = next((a.t for a in node.attribute if a.name == 'value'), None)
            if tensor is not None:
                values[node.output[0]] = numpy_helper.to_array(tensor)
        if node.op_type == 'Cast' and node.input[0] in values:
            typ = next(a.i for a in node.attribute if a.name == 'to')
            array = values[node.input[0]].astype(onnx.helper.tensor_dtype_to_np_dtype(typ))
            values[node.output[0]] = array
            graph.graph.initializer.append(numpy_helper.from_array(array, node.output[0]))
            continue
        nodes.append(node)
    del graph.graph.node[:]
    graph.graph.node.extend(nodes)
    onnx.checker.check_model(graph)
    onnx.save(graph, path)
    assets[name] = {'file': path.name, 'bytes': path.stat().st_size,
                    'sha256': sha(path), 'graphOptimizationLevel': 'disabled'}
    return name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    start = time.monotonic()
    args.output.mkdir(parents=True, exist_ok=True)
    if (args.output/'manifest.json').exists():
        raise FileExistsError('Refuse to replace a completed catalogue.')
    torch.set_num_threads(8)
    torch.manual_seed(42)
    spec = importlib.util.spec_from_file_location('rita_native_export', Path(__file__).with_name('rita-export-native.py'))
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    model, audit = helper.load_model(args.source, args.checkpoint, torch)
    assets, stages = {}, []
    write = lambda name, module, args_, names, **kw: export(args.output, name, module, args_, names, assets, **kw)
    with torch.inference_mode():
        for stage, c in enumerate([64, 128, 320, 512], 1):
            prefix = f's{stage}'
            stride, radius = (4, 3) if stage == 1 else (2, 1)
            patch_image = getattr(model.segformer, 'patch_embed'+str(stage))
            patch_mask = getattr(model.segformer, 'patch_embed'+str(stage+4))
            dummy_image = torch.zeros(1, patch_image.proj.in_channels, radius*2+1+stride*3, 32)
            dummy_mask = torch.zeros(1, patch_mask.proj.in_channels, radius*2+1+stride*3, 32)
            entry = {'channels': c, 'stride': stride, 'radius': radius,
                     'patchImage': write(prefix+'-image-patch', Patch(patch_image), [dummy_image], ['x']),
                     'blocks': []}
            if stage == 1:
                entry['patchMask'] = write(prefix+'-mask-patch', Patch(patch_mask, model.iter_embed),
                    [dummy_mask, torch.zeros(1, dtype=torch.int64)], ['x', 'iteration'],
                    dynamic={key:{2:key+'_h', 3:key+'_w'} for key in ['x', 'result']})
            else:
                entry['patchMask'] = write(prefix+'-mask-patch', Patch(patch_mask), [dummy_mask], ['x'])
            # Combined spatial bank includes both image and mask branches.
            h, w = 16, 8
            x = torch.randn(1, c, h, w)
            for index, block in enumerate(getattr(model.segformer, 'block'+str(stage))):
                bank = KeyValues(block)(x)
                kv = bank.flatten(2).transpose(1, 2).reshape(1, -1, 2,
                    block.attn.num_heads, c//block.attn.num_heads).permute(2, 0, 3, 1, 4)
                name = prefix+f'-b{index}'
                entry['blocks'].append({'heads': block.attn.num_heads, 'sr': block.attn.sr_ratio,
                    'kv': write(name+'-kv', KeyValues(block), [x], ['x']),
                    'query': write(name+'-query', Query(block),
                        [x[:, :, :1, :3], kv[0].transpose(-2, -1), kv[1]], ['x', 'key', 'value'],
                        dynamic={'x':{2:'h', 3:'w'}, 'key':{3:'keys'}, 'value':{2:'keys'}, 'result':{2:'h',3:'w'}}),
                    'mlp': write(name+'-mlp', Mlp(block), [x], ['x'])})
            entry['norm'] = write(prefix+'-norm', Norm(getattr(model.segformer, 'norm'+str(stage))), [x], ['x'])
            entry['fuse'] = write(prefix+'-fuse', Fusion(getattr(model.updown, 'cgf'+str(stage))), [x, x], ['x', 'g'])
            entry['scale'] = 2**(stage-1)
            if stage > 1:
                fused_name = ['upsample1', 'upsample2', 'upsample3'][stage-2]
                mask_name = ['upsample4', 'upsample5', 'upsample6'][stage-2]
                entry['upFused'] = write(prefix+'-project-fused', getattr(model.updown, fused_name), [x], ['x'])
                entry['upMask'] = write(prefix+'-project-mask', getattr(model.updown, mask_name), [x], ['x'])
                # Two source rows on either side cover every deconvolutional
                # path of up to three4x4/stride2/padding1 layers.
                entry['projectionHalo'] = 2
            else:
                entry['upFused'] = entry['upMask'] = None
                entry['projectionHalo'] = 0
            stages.append(entry)
            print(json.dumps({'stage':stage, 'graphs':len(assets)}), flush=True)
        head = write('decoder-fuse', Head(model.conv1), [torch.zeros(1,64,3,11)]*8,
                     ['c'+str(i) for i in range(1,9)])
        final = write('decoder-final', Final(),
                      [torch.zeros(1,4,5,7), torch.zeros(1,3,27,2)], ['pred','grid'],
                      dynamic={'pred':{2:'fh',3:'fw'},'grid':{1:'oh',2:'ow'},'result':{2:'oh',3:'ow'}})
    audit.update(schema=1, assets=assets, stages=stages, decode=head, final=final,
                 scoreClass=0, initialMaskClass=3, eosClass=2, maximumSteps=10,
                 thresholdDefault=.5,
                 selection='Exact official test.py: first step with ANY column EOS>=90%, minus1 (negative indexing); otherwise last. Keep selected class0 softmax as adjustable scientific map.',
                 preprocessing='RGB ImageNet mean/std, no scaling. Reflect pad right/bottom to multiple32, then crop.',
                 scope='Experimental native geometric adaptation; all learned weights and global attention preserved.',
                 graphCount=len(assets), modelBytes=sum(a['bytes'] for a in assets.values()),
                 seconds=time.monotonic()-start)
    (args.output/'manifest.json').write_text(json.dumps(audit, indent=2)+'\n')
    print(json.dumps({'complete':True, 'graphs':len(assets), 'bytes':audit['modelBytes'],
                      'manifest_sha256':sha(args.output/'manifest.json')}), flush=True)


if __name__ == '__main__':
    main()
