"""Browser boundary around the original Noiseprint statistics (no rewritten EM)."""
import numpy as np
import cv2 as cv
from noiseprint.post_em import getSpamFromNoiseprint, EMgu_img
from noiseprint.noiseprint_blind import genMappUint8
from noiseprint.utility.stable_covariance import STATISTICS_POLICY, RELATIVE_VARIANCE_FLOOR, floor_covariance


def composite_conditioning(sigma):
    # Diagnostic of the fitted native model, never regularization or a preflight.
    eigen = np.linalg.eigvalsh((sigma + sigma.T) * .5)
    low, high = float(eigen[0]), float(eigen[-1])
    tolerance = np.finfo(sigma.dtype).eps * len(eigen) * max(abs(low), abs(high))
    rank = int(np.count_nonzero(eigen > tolerance))
    condition = high / low if low > 0 else np.inf
    return np.asarray([low, high, condition, rank, len(eigen), tolerance], dtype=np.float64)

def composite_run(operation, arrays, report):
    if operation == 'prepare':
        rgb = arrays['rgb']
        gray = cv.cvtColor(rgb, cv.COLOR_RGB2GRAY)
        result = {'gray': gray.astype(np.float32) / 255}
        if 'automatic' in arrays:
            curve = []
            for quality in range(1, 101):
                ok, encoded = cv.imencode('.jpg', gray, [cv.IMWRITE_JPEG_QUALITY, quality])
                if not ok: raise ValueError('JPEG compression failed')
                decoded = cv.imdecode(encoded, cv.IMREAD_GRAYSCALE)
                curve.append(cv.mean(cv.absdiff(decoded, gray))[0])
                report('quality', quality, 100)
            result['curve'] = np.asarray(curve)
            normalized = cv.normalize(result['curve'], None, 0, 1, cv.NORM_MINMAX).ravel()
            result['model'] = np.asarray(1 + np.argmin(normalized), dtype=np.int32)
        return result
    if operation == 'display':
        noise = arrays['noise']
        interior = noise[34:-34,34:-34] if min(noise.shape)>68 else noise
        low, high, _, _ = cv.minMaxLoc(interior)
        result = cv.normalize(noise.clip(low,high), None, 0, 255, cv.NORM_MINMAX).astype(np.uint8)
        return {'noise_rgb': cv.cvtColor(result, cv.COLOR_GRAY2RGB)}
    gray, noise = arrays['gray'], arrays['noise']
    if min(gray.shape)<100:raise ValueError('Too few valid blocks: at least 100 × 100 pixels required.')
    report('statistics',0,1)
    spam, valid, r0, r1, imgsize = getSpamFromNoiseprint(noise, gray)
    result = {'spam': spam, 'valid': valid, 'range0':r0,'range1':r1}
    if np.sum(valid)<50:raise ValueError('Too few valid blocks for a splicing map. The noise estimate remains available.')
    report('statistics',1,1)
    mapp, other = EMgu_img(spam,valid,extFeat=range(32),seed=0,maxIter=100,replicates=10,outliersNlogl=42,workers=1)
    if not np.isfinite(mapp).all():raise ValueError('Statistical model returned nonfinite values.')
    report('fit',10,10)
    raster = genMappUint8(mapp,valid,r0,r1,imgsize)
    result.update(map=mapp, raster=raster, map_rgb=cv.cvtColor(cv.applyColorMap(raster,cv.COLORMAP_JET),cv.COLOR_BGR2RGB))
    if other.pop('statistics_policy') != STATISTICS_POLICY:raise ValueError('Composite statistics policy mismatch')
    for key in ('covariance_regularizations','pca_regularized_components'):other[key]=np.asarray(other[key],dtype=np.int32)
    result.update(other)
    result['model_conditioning'] = composite_conditioning(other['Sigma'])
    return {key: np.asarray(value) for key,value in result.items()}
