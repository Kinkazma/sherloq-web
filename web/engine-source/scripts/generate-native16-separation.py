#!/usr/bin/env python3
"""Generate synthetic native16 filter oracles using NumPy and Python OpenCV.

Both the optimized OpenCV result and the independent integer result are kept:
some host SIMD box-filter implementations differ by one native code. Production
WASM/GPU comparisons use the explicitly defined integer result.
"""
from pathlib import Path
import argparse
import base64
import json
import cv2
import numpy as np

def encoded(array):
    return base64.b64encode(array.astype('<u2').tobytes()).decode()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'fixtures/native16-separation.json')
    args = parser.parse_args()
    weights = []
    for radius in range(1, 11):
        exact = cv2.getGaussianKernel(2 * radius + 1, 0, cv2.CV_64F).ravel().tolist()
        fixed, error, mass = [0] * len(exact), 0, 0
        for i in range(radius):
            adjusted = exact[i] * 65536 + error
            value = round(adjusted)
            error = adjusted - value
            fixed[i] = fixed[-1-i] = value
            mass += value
        fixed[radius] = 65536 - 2 * mass
        weights.append(dict(radius=radius, exact=exact, fixed16=fixed))
    rng, fixtures, maximum, differing = np.random.default_rng(87549218), [], 0, 0
    specs = [('single',1,1,'random'), ('column',1,9,'ramp'), ('row',9,1,'random'), ('small',2,3,'random'), ('random-odd',17,13,'random'), ('impulse',23,17,'impulse'), ('white',7,5,'white'), ('neighbors',19,11,'neighbors')]
    for name, width, height, kind in specs:
        image = rng.integers(0, 65536, (height,width,3), dtype=np.uint16)
        if kind == 'ramp':
            image = np.arange(height*width*3, dtype=np.uint16).reshape((height,width,3))*1931
        elif kind == 'impulse':
            image.fill(0)
            image[height//2,width//2] = [65535,32768,1]
        elif kind == 'white':
            image.fill(65535)
        elif kind == 'neighbors':
            image = (32768 + np.indices((height,width,3)).sum(axis=0)%13 - 6).astype(np.uint16)
        row = dict(name=name,width=width,height=height,input=encoded(image),cases=[])
        for mode in [1,2]:
            for radius in range(1,11):
                size = 2*radius+1
                for grayscale in [False,True]:
                    cvsource = cv2.cvtColor(image,cv2.COLOR_RGB2GRAY) if grayscale else image
                    filtered = cv2.GaussianBlur(cvsource,(size,size),0,borderType=cv2.BORDER_REFLECT_101) if mode==1 else cv2.blur(cvsource,(size,size),borderType=cv2.BORDER_REFLECT_101)
                    if grayscale:
                        filtered = cv2.cvtColor(filtered,cv2.COLOR_GRAY2RGB)
                    source = image.astype(np.uint64)
                    if grayscale:
                        gray = (source[:,:,0]*9798 + source[:,:,1]*19235 + source[:,:,2]*3735 + 16384)>>15
                        source = np.repeat(gray[:,:,None],3,axis=2)
                    coefficients = weights[radius-1]['fixed16'] if mode==1 else [1]*size
                    padded = np.pad(source,((0,0),(radius,radius),(0,0)),mode='reflect')
                    horizontal = sum(padded[:,i:i+width,:]*v for i,v in enumerate(coefficients))
                    padded = np.pad(horizontal,((radius,radius),(0,0),(0,0)),mode='reflect')
                    total = sum(padded[i:i+height,:,:]*v for i,v in enumerate(coefficients))
                    result = ((total+(1<<31))>>32) if mode==1 else ((total+(size*size)//2)//(size*size))
                    result = result.astype('<u2')
                    error = np.abs(result.astype(np.int64)-filtered.astype(np.int64))
                    maximum = max(maximum,int(error.max()))
                    differing += int(np.count_nonzero(error))
                    row['cases'].append(dict(mode=mode,radius=radius,grayscale=grayscale,filtered=encoded(filtered),mathematical=encoded(result),opencvOptimizedMaximumDifference=int(error.max())))
        fixtures.append(row)
    record = dict(schema='sherloq.native16-separation-opencv-oracle/1',opencv=cv2.__version__,generatedBy='Independent Python cv2 GaussianBlur/blur uint16,REFLECT101; exact codes,not a promoted RGB8 source',fixtures=fixtures,gaussianWeights=weights,integerOracle='Independent NumPy uint64 exact separable sums,REFLECT101 and one final normalized division; grayscale integer coefficients; Gaussian fixed16 error diffusion independently from cv.getGaussianKernel',optimizedOpenCvVersusInteger=dict(maximumNativeCodeDifference=maximum,differingComponents=differing))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(record,separators=(',',':'))+'\n')
    print(len(fixtures),'synthetic fixtures;',sum(len(row['cases']) for row in fixtures),'filters; optimized-host/integer maximum difference',maximum)

if __name__ == '__main__':
    main()
