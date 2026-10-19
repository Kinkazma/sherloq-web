#!/usr/bin/env python3
"""Local oracle for exact RITA graph boundaries and original mask selection."""
import argparse
from collections import OrderedDict
import hashlib
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
import torch
from PIL import Image
import onnxruntime as ort


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def official_selection(classes):
    # Literal test.py effective column reduction, including negative indexing.
    ratios = np.mean(np.stack(classes) == 2, axis=1, dtype=np.float32)
    indices = np.nonzero(ratios >= .9)[0]
    signed = int(indices[0])-1 if len(indices) else -1
    index = signed % len(classes)
    selected = classes[index]
    values = np.unique(selected)
    values = values[values != 3]
    maximum = int(values.max()) if len(values) else None
    mask = np.where(selected == maximum, 0, 1).astype('uint8') if maximum else np.ones_like(selected)
    return index, signed, maximum, mask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--only-oracle', action='store_true')
    parser.add_argument('--image', type=Path)
    parser.add_argument('--pattern-size')
    args = parser.parse_args()
    torch.set_num_threads(8)
    torch.manual_seed(42)
    spec = importlib.util.spec_from_file_location('rita_native_export', Path(__file__).with_name('rita-export-native.py'))
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    model, _ = helper.load_model(args.source, args.checkpoint, torch)
    directory = args.directory
    manifest = json.loads((directory/'segments/manifest.json').read_text())
    refs = directory/'reference'
    refs.mkdir(exist_ok=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 8
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    sessions = OrderedDict()

    def run(name, **feeds):
        if name in sessions:
            session = sessions.pop(name)
        else:
            session = ort.InferenceSession(str(directory/'segments'/manifest['assets'][name]['file']),
                                           options, providers=['CPUExecutionProvider'])
        sessions[name] = session
        if len(sessions) > 8:
            sessions.popitem(last=False)
        return session.run(['result'], feeds)[0]

    def segmented(x):
        image, mask = x[:,:3], x[:,3:4]
        projected, expected_features = [], []
        for i, stage in enumerate(manifest['stages']):
            radius = stage['radius']
            image = run(stage['patchImage'], x=np.pad(image, ((0,0),(0,0),(radius,radius),(0,0))))
            feeds = {'x':np.pad(mask, ((0,0),(0,0),(radius,radius),(0,0)))}
            if i == 0:
                feeds['iteration'] = x[:,4,0,0].astype('int64')
            mask = run(stage['patchMask'], **feeds)
            h = image.shape[2]
            combined = np.concatenate((image, mask), axis=2)
            for block in stage['blocks']:
                bank = run(block['kv'], x=combined)
                b, twice_c, kh, kw = bank.shape
                c, heads = twice_c//2, block['heads']
                k = np.ascontiguousarray(bank[:,:c].reshape(b, heads, c//heads, kh*kw))
                v = np.ascontiguousarray(bank[:,c:].reshape(b, heads, c//heads, kh*kw).transpose(0,1,3,2))
                combined = run(block['query'], x=combined, key=k, value=v)
                combined = run(block['mlp'], x=combined)
            combined = run(stage['norm'], x=combined)
            image, mask = np.ascontiguousarray(combined[:,:,:h]), np.ascontiguousarray(combined[:,:,h:])
            expected_features.extend((image.copy(), mask.copy()))
            fused = run(stage['fuse'], x=image, g=mask)
            projected.append((run(stage['upFused'],x=fused), run(stage['upMask'],x=mask))
                             if i else (fused, mask))
        feeds = {f'c{i+1}':projected[i][0] for i in range(4)}
        feeds.update({f'c{i+5}':projected[i][1] for i in range(4)})
        pred = run(manifest['decode'], **feeds)
        h, w = x.shape[2:]
        grid = np.empty((1,h,w,2), dtype='float32')
        grid[0,:,:,0] = np.linspace(-1,1,w,dtype='float32')[None,:]
        grid[0,:,:,1] = np.linspace(-1,1,h,dtype='float32')[:,None]
        return run(manifest['final'], pred=pred, grid=grid), expected_features

    case_sizes = ([Image.open(args.image).size] if args.image else
                  [tuple(map(int,args.pattern_size.split('x')))] if args.pattern_size else [(96,64),(64,96)])
    report = {'checkpoint_sha256':helper.CHECKPOINT_SHA256,
              'manifest_sha256':digest(directory/'segments/manifest.json'),
              'cases':[], 'mask_selection_tests':[], 'mask_score_contract':'Adaptively orient score around official maximum-label background; threshold0.5 preserves official mask, score is not calibrated manipulation probability.'}
    for width, height in case_sizes:
        yy, xx = np.mgrid[:height,:width]
        rgb = (np.asarray(Image.open(args.image).convert('RGB')) if args.image else
               np.stack(((xx*7+yy*3)%256, (xx*13+yy*11)%256, (xx*5+yy*17)%256),axis=-1).astype('uint8'))
        slug=f'{width}x{height}'
        Image.fromarray(rgb).save(refs/(slug+'.png'))
        rgb.tofile(refs/(slug+'-rgb.u8'))
        image = rgb.transpose(2,0,1).astype('float32')/np.float32(255)
        image = (image-np.array([.485,.456,.406],dtype='float32')[:,None,None])/np.array([.229,.224,.225],dtype='float32')[:,None,None]
        bottom, right = (-height)%32, (-width)%32
        if bottom or right:
            image=np.pad(image,((0,0),(0,bottom),(0,right)),mode='reflect')
        padded_height,padded_width=height+bottom,width+right
        classes, logits, current = [], [], np.full((padded_height,padded_width),3,dtype='float32')
        first_error = None
        for step in range(10):
            x = np.concatenate((image, current[None], np.full((1,padded_height,padded_width),step,dtype='float32')),axis=0)[None]
            with torch.inference_mode():
                native = model(torch.from_numpy(x)).numpy()
                if step == 0:
                    iter_embed=model.iter_embed(torch.tensor([0])).unsqueeze(1)
                    _, _, native_features=model.segformer(torch.from_numpy(x[:,:4]),iter_embed)
            if step == 0 and not args.only_oracle:
                actual, actual_features = segmented(x)
                layer_errors = [float(np.abs(a-b.numpy()).max()) for a,b in zip(actual_features,native_features)]
                first_error = {'max_absolute_logit_error':float(np.abs(actual-native).max()),
                    'mean_absolute_logit_error':float(np.abs(actual-native).mean()),
                    'argmax_mismatches':int((actual.argmax(1)!=native.argmax(1)).sum()),
                    'feature_max_errors':layer_errors}
                assert first_error['max_absolute_logit_error'] < 1e-3, first_error
                print(json.dumps({'segmented':slug,**first_error}),flush=True)
            logits.append(native[0])
            current = native.argmax(1)[0].astype('uint8')
            classes.append(current)
            if (current==2).all():
                break
        selected, signed, maximum, official_mask = official_selection(classes)
        logits[selected][:,:height,:width].astype('<f4').tofile(refs/(slug+'-selected-logits.f32'))
        official_mask=official_mask[:height,:width]
        official_mask.tofile(refs/(slug+'-official-mask.u8'))
        np.stack(classes)[:,:height,:width].tofile(refs/(slug+'-classes.u8'))
        row = {'id':slug,'width':width,'height':height,'source':str(args.image) if args.image else None,'steps':len(classes),
            'padded_width':padded_width,'padded_height':padded_height,'padding_right_bottom':[right,bottom],
            'selected_step':selected,'selected_signed':signed,'maximum_label':maximum,
            'positive_pixels':int(official_mask.sum()),'class_counts':{
                str(i):int((classes[selected]==i).sum()) for i in range(4)},
            'files':{'rgb':slug+'-rgb.u8','input':slug+'.png',
                'selected_logits':slug+'-selected-logits.f32','official_mask':slug+'-official-mask.u8',
                'classes':slug+'-classes.u8'},'first_pass_segment_error':first_error}
        report['cases'].append(row)
        print(json.dumps({'oracle':row}),flush=True)
    # Tiny categorical fixtures independently pin negative indexing, the
    # per-column reduction, max-label fallback, and complete-EOS handling.
    patterns = [np.array([[0,0,0],[1,1,1]],dtype='uint8'),
                np.array([[0,2,3],[1,2,3]],dtype='uint8'),
                np.zeros((2,3),dtype='uint8'), np.full((2,3),3,dtype='uint8'),
                np.full((2,3),2,dtype='uint8')]
    for pattern in patterns:
        index,signed,maximum,mask=official_selection([pattern])
        report['mask_selection_tests'].append({'classes':pattern.tolist(),
             'selected_step':index,'signed':signed,'maximum':maximum,'mask':mask.tolist()})
    (refs/('manifest-native-image.json' if args.image else 'manifest-native-pattern.json' if args.pattern_size else 'manifest.json')).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'complete':True,'reference':str(refs/'manifest.json')}),flush=True)


if __name__=='__main__':
    main()
