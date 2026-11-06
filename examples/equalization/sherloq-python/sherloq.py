"""SHERLOQ experimental spatial histogram transport, research version 0.

Independently constructed in this research task; novelty relative to the
literature is NOT established. No recompression, denoising, or ELA operation.
All mathematical guarantees apply before output quantization, to scalar planes.
"""
from dataclasses import dataclass
from time import perf_counter
import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import cg, LinearOperator, spsolve


OFFSETS = ((0, 1, 1.0), (1, 0, 1.0), (1, 1, 2**-0.5), (1, -1, 2**-0.5))


def neighbor_pairs(shape):
    h, w = shape
    ids = np.arange(h*w).reshape(h, w)
    for dy, dx, weight in OFFSETS:
        ya, yb = slice(0, h-dy), slice(dy, h)
        xa, xb = (slice(0, w-dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w+dx))
        yield ids[ya, xa].ravel(), ids[yb, xb].ravel(), weight


@dataclass
class Prepared:
    shape: tuple
    source: np.ndarray
    labels: np.ndarray
    levels: np.ndarray
    area: np.ndarray
    low: np.ndarray
    high: np.ndarray
    difference: np.ndarray
    multiplicity: np.ndarray
    median: float
    incidence: object
    preparation_seconds: float


def prepare(source):
    started = perf_counter()
    x = np.asarray(source, dtype=np.float64)
    if x.ndim != 2 or not x.size or not np.isfinite(x).all() or x.min() < 0 or x.max() > 1:
        raise ValueError('A nonempty, finite, normalized scalar plane is required.')
    x = x.copy()
    flat = x.ravel()
    pairs = list(neighbor_pairs(x.shape))
    zr, zc = [], []
    for i, j, _ in pairs:
        same = flat[i] == flat[j]
        zr.append(i[same]); zc.append(j[same])
    rows, cols = np.concatenate(zr), np.concatenate(zc)
    graph = sparse.coo_matrix((np.ones(rows.size, dtype=np.uint8), (rows, cols)), shape=(x.size, x.size)).tocsr()
    count, labels = connected_components(graph, directed=False)
    _, first = np.unique(labels, return_index=True)
    levels = flat[first]
    area = np.bincount(labels, minlength=count).astype(np.float64) / x.size
    lows, highs, mults = [], [], []
    for i, j, weight in pairs:
        different = flat[i] != flat[j]
        ii, jj = i[different], j[different]
        lower = flat[ii] < flat[jj]
        lows.append(labels[np.where(lower, ii, jj)])
        highs.append(labels[np.where(lower, jj, ii)])
        mults.append(np.full(ii.size, weight))
    lo, hi, mult = np.concatenate(lows), np.concatenate(highs), np.concatenate(mults)
    if lo.size:
        codes = lo.astype(np.int64)*count + hi
        unique, inverse = np.unique(codes, return_inverse=True)
        lo, hi = unique//count, unique % count
        mult = np.bincount(inverse, weights=mult)
        difference = levels[hi]-levels[lo]
        order = np.argsort(difference, kind='stable')
        cumulative = np.cumsum(mult[order])
        median = float(difference[order[np.searchsorted(cumulative, cumulative[-1]/2)]])
        e = np.arange(lo.size)
        incidence = sparse.coo_matrix((np.r_[-np.ones(lo.size), np.ones(lo.size)],
                                      (np.r_[e, e], np.r_[lo, hi])), shape=(lo.size, count)).tocsr()
    else:
        difference = np.empty(0); median = 0.0
        incidence = sparse.csr_matrix((0, count))
    x.flags.writeable = False
    return Prepared(x.shape, x, labels, levels, area, lo, hi, difference, mult,
                    median, incidence, perf_counter()-started)


def solve(prepared, micro=0.0, rho=0.1, headroom=0.02, tolerance=5e-4,
          max_iterations=180, initial=None, verbose=False, alpha_bounds=(0.5,0.125),
          contrast_target=None, fidelity=0.0, fidelity_weights=None):
    """Unique convex optimum, with a conservative weighted RMS error bound.

    Input equality components are exact. Every accepted iterate satisfies
    y[high]-y[low] > rho * source_difference, and 0 < y < 1.
    Convergence status is always returned; an unfinished solve is not certified.
    """
    if (not 0 <= micro <= 1 or not 0 < rho < 1 or headroom <= 0 or tolerance <= 0
        or not alpha_bounds[0] >= alpha_bounds[1] > 0 or fidelity < 0):
        raise ValueError('Invalid controls or research constants.')
    start = perf_counter(); p = prepared
    if not p.difference.size:
        return p.source.copy(), {'converged': True, 'constant': True, 'seconds': perf_counter()-start,
                                  'iterations': 0, 'rms_error_bound': 0.0, 'micro': micro}
    alpha = (1-micro)*alpha_bounds[0]+micro*alpha_bounds[1]
    weights = p.multiplicity*(p.difference/(p.difference+p.median))**alpha
    weights /= weights.sum()
    target = None if contrast_target is None else np.asarray(contrast_target,dtype=np.float64)
    if target is not None and (target.shape != p.difference.shape or not np.isfinite(target).all() or np.any(target<=0)):
        raise ValueError('Contrast targets must be finite positive values for each graph edge.')
    if fidelity and target is None:
        raise ValueError('A fidelity penalty requires contrast targets.')
    relative_weights = np.ones_like(weights) if fidelity_weights is None else np.asarray(fidelity_weights,dtype=np.float64)
    if relative_weights.shape != weights.shape or not np.isfinite(relative_weights).all() or np.any(relative_weights < 0):
        raise ValueError('Fidelity weights must be finite and nonnegative.')
    fidelity_curvature = fidelity*weights*relative_weights/(target*target) if fidelity else 0.0
    floor = rho*p.difference
    B, lo, hi, area = p.incidence, p.low, p.high, p.area
    n = p.levels.size
    if initial is None:
        # Strictly feasible initial point. Only initialization uses level ranks;
        # the unique converged solution does not depend on this choice.
        _, rank = np.unique(p.levels, return_inverse=True)
        rank = rank / rank.max()
        y = rho*p.levels+(1-rho)*(0.01+0.98*rank)
    else:
        v = np.asarray(initial, dtype=np.float64)
        if v.shape == p.shape:
            _, first = np.unique(p.labels, return_index=True)
            y = v.ravel()[first].copy()
        elif v.shape == p.levels.shape:
            y = v.copy()
        else:
            raise ValueError('Wrong warm-start shape.')

    def objective(z):
        slack = z[hi]-z[lo]-floor
        if z.min() <= 0 or z.max() >= 1 or slack.min() <= 0:
            return np.inf
        result = -weights@np.log(slack) - headroom*(area@(np.log(z)+np.log1p(-z)))
        if fidelity:
            error=z[hi]-z[lo]-target
            result += .5*np.sum(fidelity_curvature*error*error)
        return float(result)

    if not np.isfinite(objective(y)):
        raise ValueError('Initial point is not strictly feasible.')
    history = []; converged = False; cg_total = 0; error_bound = np.inf
    for iteration in range(max_iterations+1):
        slack = y[hi]-y[lo]-floor
        edge_force = -weights/slack
        if fidelity: edge_force = edge_force+fidelity_curvature*(y[hi]-y[lo]-target)
        gradient = np.asarray(B.T@edge_force).ravel() + headroom*area*(-1/y+1/(1-y))
        # f is 8*headroom-strongly convex in the area-weighted Euclidean norm.
        dual_norm = float(np.sqrt(np.sum(gradient*gradient/area)))
        error_bound = dual_norm/(8*headroom)
        value = objective(y)
        history.append({'iteration': iteration, 'objective': value, 'rms_error_bound': error_bound})
        if verbose and (iteration % 5 == 0 or error_bound <= tolerance):
            print(f'iter {iteration:3d} f={value:.8g} RMS-bound={error_bound:.3g} t={perf_counter()-start:.2f}s', flush=True)
        if error_bound <= tolerance:
            converged = True; break
        if iteration == max_iterations:
            break
        curvature = weights/(slack*slack)+fidelity_curvature
        diagonal = headroom*area*(1/y**2+1/(1-y)**2)
        H = (B.T@sparse.diags(curvature)@B+sparse.diags(diagonal)).tocsr()
        if n < 1500:
            step = spsolve(H, -gradient)
            cg_info = 0
        else:
            diag = H.diagonal()
            counter = [0]
            def tick(_): counter[0] += 1
            M = LinearOperator((n, n), matvec=lambda q:q/diag)
            step, cg_info = cg(H, -gradient, M=M, rtol=min(0.1, max(1e-8, error_bound*0.01)),
                               atol=0, maxiter=2000, callback=tick)
            cg_total += counter[0]
        directional = float(gradient@step)
        if not np.isfinite(step).all() or directional >= 0:
            step = -gradient/H.diagonal()
            directional = float(gradient@step)
        rate = 1.0
        neg, pos = step < 0, step > 0
        if neg.any(): rate = min(rate, float(np.min(-0.99*y[neg]/step[neg])))
        if pos.any(): rate = min(rate, float(np.min(0.99*(1-y[pos])/step[pos])))
        ds = step[hi]-step[lo]
        falling = ds < 0
        if falling.any(): rate = min(rate, float(np.min(-0.99*slack[falling]/ds[falling])))
        for backtrack in range(55):
            trial = y+rate*step
            if objective(trial) <= value+1e-4*rate*directional:
                break
            rate *= 0.5
        else:
            break
        y = trial
        history[-1].update(step_size=rate, cg_status=int(cg_info))
    result = y[p.labels].reshape(p.shape)
    original_d = p.difference
    gains = (y[hi]-y[lo])/original_d
    info = {'converged': converged, 'constant': False, 'seconds': perf_counter()-start,
            'iterations': iteration, 'rms_error_bound': error_bound, 'objective': objective(y),
            'components': n, 'edges': int(lo.size), 'minimum_gain': float(gains.min()),
            'maximum_gain': float(gains.max()), 'output_minimum': float(y.min()),
            'output_maximum': float(y.max()), 'micro': micro, 'alpha': alpha,
            'rho': rho, 'headroom': headroom, 'alpha_bounds': list(alpha_bounds), 'median_source_difference': p.median,
            'fidelity': fidelity,
            'cg_iterations': cg_total, 'history': history}
    return result, info


def reveal(source, revelation, micro=0.0, **kwargs):
    """Normalized scalar API. At zero, return an exact copy of the input dtype."""
    if not 0 <= revelation <= 1 or not 0 <= micro <= 1:
        raise ValueError('Revelation must lie in [0,1].')
    if revelation == 0:
        return np.array(source, copy=True), {'identity': True, 'converged': True}
    p = prepare(source)
    target, info = solve(p, micro=micro, **kwargs)
    info['revelation'] = revelation
    info['preparation_seconds'] = p.preparation_seconds
    info['effective_minimum_gain'] = 1-revelation+revelation*kwargs.get('rho', 0.1)
    return (1-revelation)*p.source+revelation*target, info
