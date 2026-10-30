# Equalization display methods

The menu is a display transform. Original encoded bytes, scientific fields,
metrics and model inputs stay unchanged. Histogram, CLAHE and AHE are listed
first. The same slider controls the active method; each control owner stores
one value per method in its portable settings. Linear ELA remains independent.

The original histogram and four CLAHE settings use their existing native
kernels. Other selections are a bounded CPU presentation pass after the native
operator, including when that operator uses the GPU. Global and local statistics
omit excluded pixels; CVC also omits excluded neighbours. Output storage shares
the caller's memory budget and can use its temporary storage. Cancellation
retires incomplete output. Retained PCA previews reuse the native PCA basis.

## Digital conventions

- General image adjustments and ELA map HSV value (maximum RGB component), then
  preserve the RGB ratios. Gradient, PCA, comparison, residual and magnifier
  displays map each RGB channel, following their original equalization scope.
- Histogram uses the existing OpenCV CDF-min convention. Research methods use
  their interval CDF without CDF-min subtraction and saturating half-up rounding.
  Methods without an intrinsic parameter use an explicit intensity blend.
- AHE is the interpolated tiled variant without contrast clipping. Its grid is
  adjustable. CLAHE keeps eight tiles per axis and adjusts the clip limit.
  Reflected padding and bilinear LUT interpolation are explicit. New interpolated
  modes can differ from OpenCV by one level because of floating point evaluation;
  the historical CLAHE settings retain their exact original path.
- BBHE splits at the floored mean. DSIHE/RSIHE use the conditional median. RSWHE-D
  uses the paper's global-CDF endpoint convention. Recursive depth is adjustable.
- MMBEBHE minimizes the paper's integer SMBE expression, an approximate brightness
  error criterion; it does not promise zero measured output brightness error.
- DHE is an experimental digital reconstruction: 3-bin smoothing, intensity
  weighted mean/sigma subdivision, and largest-remainder output-range allocation.
  Its slider controls count emphasis. BPDHE uses a 9-bin Gaussian, trend pattern
  peak detection, discrete range allocation and final mean normalization. These
  implementation choices are exposed in the research comparison protocol.
- WTHE varies the weighting exponent; upper ratio is 0.5 and lower probability
  is 0.01/256. Its final mean offset is followed by clipping.
- ESIHE's default clip factor 1 follows the author's implementation. Other factors
  are an exploratory extension. The upper endpoint can reach 256 before saturation;
  degenerate splitting thresholds are guarded. The original author license is
  retained in `ESIHE-LICENSE.txt` in this directory.
- CVC uses a reflected odd neighbourhood including the centre, weights alpha =
  beta = gamma = 1/3, a tridiagonal linear solve and diagonal 2D-CDF matching.
- AGCWD is adaptive gamma correction from a weighted distribution, adjacent to
  histogram equalization. Its weighting exponent is adjustable and T(0) = 0.

These are experimental reproductions with stated digital conventions, not
implementations certified by the authors. Their references are retained below.

## Original references

- **BBHE** — Yeong-Taeg Kim (1997). [Contrast Enhancement Using Brightness Preserving Bi-Histogram Equalization](https://doi.org/10.1109/30.580378).
- **DSIHE** — Yu Wang, Qian Chen, Baeomin Zhang (1999). [Image enhancement based on equal area dualistic sub-image histogram equalization method](https://doi.org/10.1109/30.754419).
- **MMBEBHE** — Soong-Der Chen, Abd. Rahman Ramli (2003). [Minimum Mean Brightness Error Bi-Histogram Equalization in Contrast Enhancement](https://doi.org/10.1109/TCE.2003.1261234).
- **RMSHE** — Soong-Der Chen, Abd.R. Ramli (2003). [Contrast enhancement using recursive mean-separate histogram equalization for scalable brightness preservation](https://doi.org/10.1109/TCE.2003.1261233).
- **RSIHE** — K.S. Sim, C.P. Tso, Y.Y. Tan (2007). [Recursive sub-image histogram equalization applied to gray scale images](https://doi.org/10.1016/j.patrec.2007.02.003).
- **RSWHE** — Mary Kim, Min Gyo Chung (2008). [Recursively Separated and Weighted Histogram Equalization for Brightness Preservation and Contrast Enhancement](https://doi.org/10.1109/TCE.2008.4637632).
- **DHE** — M. Abdullah-Al-Wadud, Md. Hasanul Kabir, M. Ali Akber Dewan, Oksam Chae (2007). [A Dynamic Histogram Equalization for Image Contrast Enhancement](https://doi.org/10.1109/TCE.2007.381734).
- **BPDHE** — Haidi Ibrahim, Nicholas Sia Pik Kong (2007). [Brightness Preserving Dynamic Histogram Equalization for Image Contrast Enhancement](https://doi.org/10.1109/TCE.2007.4429280).
- **WTHE** — Qing Wang, Rabab Ward (2007). [Fast Image/Video Contrast Enhancement Based on Weighted Thresholded Histogram Equalization](https://doi.org/10.1109/TCE.2007.381756).
- **ESIHE** — Kuldeep Singh, Rajiv Kapoor (2014). [Image enhancement using Exposure based Sub Image Histogram Equalization](https://doi.org/10.1016/j.patrec.2013.08.024).
- **CVC** — T. Celik, T. Tjahjadi (2011). [Contextual and Variational Contrast Enhancement](https://doi.org/10.1109/TIP.2011.2157513).
- **AHE** — Stephen M. Pizer, E. Philip Amburn, John D. Austin, Robert Cromartie, Ari Geselowitz, Trey Greer, Bart ter Haar Romeny, John B. Zimmerman, Karel Zuiderveld (1987). [Adaptive histogram equalization and its variations](https://doi.org/10.1016/S0734-189X(87)80186-X).
- **CLAHE** — Karel Zuiderveld (1994). [Contrast Limited Adaptive Histogram Equalization](https://doi.org/10.1016/B978-0-12-336156-1.50061-6).
- **AGCWD** — Shih-Chia Huang, Fan-Chieh Cheng, Yi-Sheng Chiu (2013). [Efficient Contrast Enhancement Using Adaptive Gamma Correction With Weighting Distribution](https://doi.org/10.1109/TIP.2012.2226047).
