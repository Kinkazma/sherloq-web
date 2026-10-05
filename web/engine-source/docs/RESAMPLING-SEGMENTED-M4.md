# Resampling Fourier on segmented original JPEGs

`tampering.resampling.fourier` accepts JPEG sources loaded with
`loadBlob({layout:'segmented'})`. Parameters retain `rect:[x0,y0,x1,y1]` (exclusive
end), `window:'hanning'|'radial'`, `upsample`, `center`,
`highpass:'simple'|'radial'`, `gamma` and `rescale`. The same even spatial square
and center-crop geometry apply. Grayscale comes from the original JPEG ISLOW
path, with EXIF orientation; extrema cover the whole original grayscale source
before applying any ROI. The existing contiguous API is unchanged.

The source retains original gray bytes/extrema, one complete binary64 NumPy
spectrum, one magnitude plane and one presentation. Complete rows/columns use
the pinned NumPy1.26 pocketfft kernel. `pyrUp` strips include the actual halo and
retain the original arithmetic/borders. Spectrum shifting is a read view.
Window, mask and normalization formulas remain global. No independent tile FFT
or reduced-resolution replacement is used. CPU workers process useful complete
axes/upsampling strips under shared admission; there is no runtime calibration.

The segmented result has an RGB `surface` and two paged Float64 tables:
`tables.magnitude` (`frequency_y,frequency_x,magnitude`) and `tables.values`
(`frequency_y,frequency_x,value`). Read through `readPixels`, `readTable` or
`readTableCsv`; release every surface/table handle. These replace full contiguous
`data.magnitude`/`data.values` arrays only for segmented results. Data retains
`minimumMagnitude`, `maximumMagnitude`, `geometry` and `grayNormalization`.
The raster layer declares `coordinateSpace:'frequency-grid'`. Values are Fourier
evidence, not resampling probabilities. B owns controls and exported presentation.

`grayCached`, `spectrumCached`, `magnitudeCached`, `displayCached` describe reuse.
Changing gamma/rescale reads magnitude and renders only; an identical request
returns independent storage leases without calculation (`workers:0`). Earlier
leases remain readable after cache replacement. Progress names are
`resampling-file-gray`, `resampling-gray-extrema`, `resampling-window`,
`resampling-pyrup`, `resampling-fft-rows`, `resampling-fft-columns`,
`resampling-magnitude`, `resampling-view`. Cancellation discards new temporary
planes and preserves the prior cache. Unload releases caches and temporary files.

Axes remain limited to16384, as in the qualified contiguous arithmetic adapter;
one complete axis and the pyrUp halo must fit. Outputs/intermediates use adaptive
RAM/OPFS/IDB storage. Returned table reads have independent page reservations.
FFT is CPU, with no claimed GPU parity. Probability-map EM is still a separate,
unreleased work item; this adapter does not silently substitute Fourier for EM.

Validation: complete-axis FFT and pyrUp strips are bit-identical to the qualified
whole kernels on five shapes, including odd/non-power-of-two dimensions.100 native
JPEG/orientation/progressive variants preserve exact RGB previews and the existing
scalar bound abs(error)/max(1,abs(native))<=1e-8. Six cancellation stages, cache-only
presentation, independent leases and eviction cleanup pass. Chrome512MiB on a1MP
JPEG (up to2048² output) uses four workers, matches three native RGB SHA256, and
has maximum scaled scalar error4.72e-13, within the pre-existing bound. No new
numerical tolerance is introduced. See `resampling-stream-parallel-browser-proof.json`.

Chrome64MiB also passes all three native RGB/scalar comparisons, including the
2048² spectrum, with OPFS and44.15MB peak accounted memory. Cache-only/gamma-only
requests pass, and all temporary files are removed. See
`resampling-stream-browser-proof.json`. The disk path trades I/O time for the
bounded working set; no universal throughput improvement is claimed.
