"""Native one-Gaussian EM equations over complete, externally stored row banks.

Only reductions are partitioned. The authorized covariance-floor-v1 is global.
No sample selection, local
PCA/model fitting, iteration reduction or independent tile probabilities.
"""
from scipy.linalg import eigvalsh
from noiseprint.utility.gaussianMixture import gm, softmax

def bank_model(arrays):
    model=gm(32,[0],[2],outliersProb=float(arrays['outliersProb']),outliersNlogl=42,dtype=np.float64)
    model.mu=arrays['mu'];model.listSigma=[arrays['Sigma']];model.prioriProb=arrays['prioriProb']
    return model

def composite_banked(operation, arrays, report):
    if operation == 'quality':
        gray=arrays['gray'];curve=[]
        for quality in range(1,101):
            ok,encoded=cv.imencode('.jpg',gray,[cv.IMWRITE_JPEG_QUALITY,quality])
            if not ok:raise ValueError('JPEG compression failed')
            decoded=cv.imdecode(encoded,cv.IMREAD_GRAYSCALE)
            curve.append(cv.mean(cv.absdiff(decoded,gray))[0]);report('quality',quality,100)
        curve=np.asarray(curve);normalized=cv.normalize(curve,None,0,1,cv.NORM_MINMAX).ravel()
        return {'curve':curve,'model':np.asarray(1+np.argmin(normalized),dtype=np.int32)}
    if operation in ('initial-sum','initial-variance'):
        values=arrays['projected'];total=arrays['sum'].copy()
        if operation=='initial-variance':values=np.square(values-arrays['mean'])
        # Same axis-0 row order as native NumPy mean/variance.
        for row in values:total+=row
        return {'sum':total}
    if operation == 'initial-model':
        reference_scale=float(np.max(arrays['variance']))
        variance=arrays['variance']+np.abs(np.spacing(reference_scale))
        sigma,changed=floor_covariance(np.diag(variance.ravel()),reference_scale)
        return {'mu':arrays['point'].reshape(1,32),'Sigma':sigma,'covariance_reference_scale':np.asarray(reference_scale),
            'covariance_regularizations':np.asarray(int(changed),dtype=np.int32),'prioriProb':np.asarray([[.99]]),'outliersProb':np.asarray(.01)}
    if operation == 'initial-indices':
        random=np.random.RandomState(0);return {'indices':random.random_integers(low=0,high=int(arrays['count'])-1,size=(10,)).astype(np.int32)}
    if operation == 'expectation':
        values=arrays['projected'];post,score=softmax(bank_model(arrays).getLoglh(values))
        return {'post':post,'counts':post.sum(axis=0),'weighted':np.tensordot(post,values,(0,0)),'scoreSum':np.asarray(score*len(values))}
    if operation == 'covariance':
        values=np.sqrt(arrays['post'][:,:1])*(arrays['projected']-arrays['mean'][(0,),:])
        return {'covariance':arrays['covariance']+composite_gram(values)}
    if operation == 'maximization':
        sigma=arrays['covariance']/arrays['counts'][0]
        sigma=sigma+np.abs(np.spacing(eigvalsh(sigma,subset_by_index=(31,31))))*np.eye(32)
        sigma,changed=floor_covariance(sigma,float(arrays['covariance_reference_scale']))
        total=arrays['counts'].sum()
        return {'mu':arrays['mean'].reshape(2,32),'Sigma':sigma,
            'covariance_reference_scale':arrays['covariance_reference_scale'],
            'covariance_regularizations':np.asarray(int(arrays['covariance_regularizations'])+int(changed),dtype=np.int32),
            'prioriProb':(arrays['counts'][:1]/total).reshape(1,1),'outliersProb':np.asarray(arrays['counts'][1]/total)}
    if operation == 'conditioning':return {'model_conditioning':composite_conditioning(arrays['Sigma'])}
    if operation == 'map-grid':
        mapp=arrays['map'].copy();valid=arrays['valid']>0;mapp[~valid]=np.min(mapp[valid]);low=np.nanmin(mapp);high=np.nanmax(mapp)
        return {'grid':np.zeros(mapp.shape,dtype=np.uint8) if high==low else (255*(mapp.clip(low,high)-low)/(high-low)).clip(0,255).astype(np.uint8)}
    if operation == 'noise-display':
        low,high=arrays['range'];noise=arrays['noise'];values=np.concatenate((np.asarray([low,high],dtype=np.float32),noise.clip(low,high).ravel()))
        normalized=cv.normalize(values,None,0,255,cv.NORM_MINMAX).ravel()[2:].astype(np.uint8).reshape(noise.shape)
        return {'noise_rgb':cv.cvtColor(normalized,cv.COLOR_GRAY2RGB)}
    if operation == 'color':return {'map_rgb':cv.cvtColor(cv.applyColorMap(arrays['raster'],cv.COLORMAP_JET),cv.COLOR_BGR2RGB)}
    raise ValueError('Unknown banked statistics operation')
