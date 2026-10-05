"""Bounded orchestration of the native SPAM/PCA/EM, without changing its model."""
from noiseprint.post_em import getWeights, paramSpam_default
from noiseprint.feat_spam.spam_np_opt import getSpamRes
from noiseprint.utility.gaussianMixture import gm
from scipy.linalg.blas import dsyrk, dgemm

def composite_gram(values):
    # Same global X.T @ X in float64. SciPy's shipped BLAS uses the symmetric
    # operation; each off-diagonal is mirrored rather than recomputed. Do not
    # change the PCA dimension, centering, regularizer or fitted model.
    upper = dsyrk(1., np.asfortranarray(values, dtype=np.float64), trans=1)
    lower = np.tril_indices(upper.shape[0], -1)
    upper[lower] = upper.T[lower]
    return upper

def composite_stream(operation, arrays, report):
    if operation == 'weights':
        return {'weights': getWeights(arrays['gray'], arrays['noise']).astype(np.uint8)}
    if operation == 'features':
        a, b, lo = arrays['rows'].astype(np.int64).tolist()
        spam, weight, r0, r1 = getSpamRes(arrays['noise'], paramSpam_default, 64,
            weights=arrays['weights'].astype(bool), paddingModality=0)
        spam = np.sqrt(np.abs(spam))[2:-2,2:-2]
        valid = (weight >= .95)[2:-2,2:-2]
        start = a - lo//8
        return {'features': spam[start:start+b-a], 'valid': valid[start:start+b-a].astype(np.uint8)}
    if operation == 'mean':
        values = arrays['features'].reshape(-1,512)[arrays['valid'].ravel().astype(bool)].astype(np.float64)
        # NumPy axis-0 summation follows row order. Start with the prior rows
        # instead of changing their order through a tree of per-tile means.
        total = arrays['sum'].copy()
        for row in values: total += row
        return {'sum':total}
    if operation == 'covariance':
        values = arrays['features'].reshape(-1,512)[arrays['valid'].ravel().astype(bool)].astype(np.float64)
        values -= arrays['mean']
        return {'covariance': arrays['covariance'] + composite_gram(values)}
    if operation == 'basis':
        cov = arrays['covariance'] / float(arrays['count'])
        eigs, basis = np.linalg.eigh(cov)
        eigs, basis = eigs[::-1], basis[:,::-1]
        if not np.isfinite(eigs).all() or eigs[0]<=0:raise ValueError('Insufficient finite variation for the statistical model.')
        floor=RELATIVE_VARIANCE_FLOOR*eigs[0]
        return {'L':basis[:,:32] / np.sqrt(np.maximum(eigs[:32],floor)), 'eigs':eigs,
            'pca_regularized_components':np.asarray(np.count_nonzero(eigs[:32]<floor),dtype=np.int32)}
    if operation == 'project':
        return {'projected': dgemm(1., np.asarray(arrays['features'].reshape(-1,512), dtype=np.float64, order='F'), arrays['L'])}
    if operation == 'fit':
        features = arrays['projected']
        random = np.random.RandomState(0)
        # Exactly the draws consumed by the previous native initializations.
        for _ in range(int(arrays['replicate'])):
            random.random_integers(low=0, high=len(features)-1, size=(1,))
        model = gm(512,[0],[2],outliersProb=.01,outliersNlogl=42,dtype=features.dtype,covariance_floor=RELATIVE_VARIANCE_FLOOR)
        model.setRandomParams(features,regularizer=-1.,randomState=random)
        score, flag, iteration = model.EM(features,maxIter=100,regularizer=-1.)
        return {'score':np.asarray(score), 'Sigma':model.listSigma[0], 'mu':model.mu,
            'prioriProb':model.prioriProb, 'outliersProb':np.asarray(model.outliersProb),
            'covariance_regularizations':np.asarray(model.covariance_regularizations,dtype=np.int32),
            'covariance_reference_scale':np.asarray(model.covariance_reference_scale),
            'fitExit':np.asarray([flag,iteration],dtype=np.int32),
            'model_conditioning':composite_conditioning(model.listSigma[0])}
    if operation == 'distances':
        model = gm(512,[0],[2],outliersProb=float(arrays['outliersProb']),outliersNlogl=42,dtype=np.float64)
        model.mu=arrays['mu'];model.listSigma=[arrays['Sigma']];model.prioriProb=arrays['prioriProb']
        _, mahal = model.getNlogl(arrays['projected'])
        return {'map':mahal.ravel()}
    if operation == 'raster':
        mapp, valid = arrays['map'], arrays['valid'].astype(bool)
        shape = tuple(arrays['imgsize'].astype(np.int64))
        raster=genMappUint8(mapp,valid,arrays['range0'],arrays['range1'],shape)
        return {'raster':raster, 'map_rgb':cv.cvtColor(cv.applyColorMap(raster,cv.COLORMAP_JET),cv.COLOR_BGR2RGB)}
    raise ValueError('Unknown bounded statistics operation')
