// Copyright 2016 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Disclaimer: This is not an official Google product.
//
// Author: Jyrki Alakuijala (jyrki.alakuijala@gmail.com)

#ifndef BUTTERAUGLI_BUTTERAUGLI_H_
#define BUTTERAUGLI_BUTTERAUGLI_H_

#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <vector>
#include "../../native/comparison-paged-plane.h"

#define BUTTERAUGLI_ENABLE_CHECKS 0

// This is the main interface to butteraugli image similarity
// analysis function.

namespace butteraugli {

template<typename T>
class Image;

using Image8 = Image<uint8_t>;
using ImageF = Image<float>;

// ButteraugliInterface defines the public interface for butteraugli.
//
// It calculates the difference between rgb0 and rgb1.
//
// rgb0 and rgb1 contain the images. rgb0[c][px] and rgb1[c][px] contains
// the red image for c == 0, green for c == 1, blue for c == 2. Location index
// px is calculated as y * xsize + x.
//
// Value of pixels of images rgb0 and rgb1 need to be represented as raw
// intensity. Most image formats store gamma corrected intensity in pixel
// values. This gamma correction has to be removed, by applying the following
// function:
// butteraugli_val = 255.0 * pow(png_val / 255.0, gamma);
// A typical value of gamma is 2.2. It is usually stored in the image header.
// Take care not to confuse that value with its inverse. The gamma value should
// be always greater than one.
// Butteraugli does not work as intended if the caller does not perform
// gamma correction.
//
// diffmap will contain an image of the size xsize * ysize, containing
// localized differences for values px (indexed with the px the same as rgb0
// and rgb1). diffvalue will give a global score of similarity.
//
// A diffvalue smaller than kButteraugliGood indicates that images can be
// observed as the same image.
// diffvalue larger than kButteraugliBad indicates that a difference between
// the images can be observed.
// A diffvalue between kButteraugliGood and kButteraugliBad indicates that
// a subtle difference can be observed between the images.
//
// Returns true on success.

bool ButteraugliInterface(const std::vector<ImageF> &rgb0,
                          const std::vector<ImageF> &rgb1,
                          float hf_asymmetry,
                          ImageF &diffmap,
                          double &diffvalue);

const double kButteraugliQuantLow = 0.26;
const double kButteraugliQuantHigh = 1.454;

// Converts the butteraugli score into fuzzy class values that are continuous
// at the class boundary. The class boundary location is based on human
// raters, but the slope is arbitrary. Particularly, it does not reflect
// the expectation value of probabilities of the human raters. It is just
// expected that a smoother class boundary will allow for higher-level
// optimization algorithms to work faster.
//
// Returns 2.0 for a perfect match, and 1.0 for 'ok', 0.0 for bad. Because the
// scoring is fuzzy, a butteraugli score of 0.96 would return a class of
// around 1.9.
double ButteraugliFuzzyClass(double score);

// Input values should be in range 0 (bad) to 2 (good). Use
// kButteraugliNormalization as normalization.
double ButteraugliFuzzyInverse(double seek);

// Returns a map which can be used for adaptive quantization. Values can
// typically range from kButteraugliQuantLow to kButteraugliQuantHigh. Low
// values require coarse quantization (e.g. near random noise), high values
// require fine quantization (e.g. in smooth bright areas).
bool ButteraugliAdaptiveQuantization(size_t xsize, size_t ysize,
    const std::vector<std::vector<float> > &rgb, std::vector<float> &quant);

// Implementation details, don't use anything below or your code will
// break in the future.

#ifdef _MSC_VER
#define BUTTERAUGLI_RESTRICT __restrict
#else
#define BUTTERAUGLI_RESTRICT __restrict__
#endif

#ifdef _MSC_VER
#define BUTTERAUGLI_INLINE __forceinline
#else
#define BUTTERAUGLI_INLINE inline
#endif

#ifdef __clang__
// Early versions of Clang did not support __builtin_assume_aligned.
#define BUTTERAUGLI_HAS_ASSUME_ALIGNED __has_builtin(__builtin_assume_aligned)
#elif defined(__GNUC__)
#define BUTTERAUGLI_HAS_ASSUME_ALIGNED 1
#else
#define BUTTERAUGLI_HAS_ASSUME_ALIGNED 0
#endif

// Returns a void* pointer which the compiler then assumes is N-byte aligned.
// Example: float* PIK_RESTRICT aligned = (float*)PIK_ASSUME_ALIGNED(in, 32);
//
// The assignment semantics are required by GCC/Clang. ICC provides an in-place
// __assume_aligned, whereas MSVC's __assume appears unsuitable.
#if BUTTERAUGLI_HAS_ASSUME_ALIGNED
#define BUTTERAUGLI_ASSUME_ALIGNED(ptr, align) __builtin_assume_aligned((ptr), (align))
#else
#define BUTTERAUGLI_ASSUME_ALIGNED(ptr, align) (ptr)
#endif  // BUTTERAUGLI_HAS_ASSUME_ALIGNED

// Functions that depend on the cache line size.
class CacheAligned {
 public:
  static constexpr size_t kPointerSize = sizeof(void *);
  static constexpr size_t kCacheLineSize = 64;

  // The aligned-return annotation is only allowed on function declarations.
  static void *Allocate(const size_t bytes);
  static void Free(void *aligned_pointer);
};

template <typename T>
using CacheAlignedUniquePtrT = std::unique_ptr<T[], void (*)(void *)>;

using CacheAlignedUniquePtr = CacheAlignedUniquePtrT<uint8_t>;

template <typename T = uint8_t>
static inline CacheAlignedUniquePtrT<T> Allocate(const size_t entries) {
  return CacheAlignedUniquePtrT<T>(
      static_cast<T * const BUTTERAUGLI_RESTRICT>(
          CacheAligned::Allocate(entries * sizeof(T))),
      CacheAligned::Free);
}

// Returns the smallest integer not less than "amount" that is divisible by
// "multiple", which must be a power of two.
template <size_t multiple>
static inline size_t Align(const size_t amount) {
  static_assert(multiple != 0 && ((multiple & (multiple - 1)) == 0),
                "Align<> argument must be a power of two");
  return (amount + multiple - 1) & ~(multiple - 1);
}

// Single channel, contiguous (cache-aligned) rows separated by padding.
// T must be POD.
//
// Rationale: vectorization benefits from aligned operands - unaligned loads and
// especially stores are expensive when the address crosses cache line
// boundaries. Introducing padding after each row ensures the start of a row is
// aligned, and that row loops can process entire vectors (writes to the padding
// are allowed and ignored).
//
// We prefer a planar representation, where channels are stored as separate
// 2D arrays, because that simplifies vectorization (repeating the same
// operation on multiple adjacent components) without the complexity of a
// hybrid layout (8 R, 8 G, 8 B, ...). In particular, clients can easily iterate
// over all components in a row and Image requires no knowledge of the pixel
// format beyond the component type "T". The downside is that we duplicate the
// xsize/ysize members for each channel.
//
// This image layout could also be achieved with a vector and a row accessor
// function, but a class wrapper with support for "deleter" allows wrapping
// existing memory allocated by clients without copying the pixels. It also
// provides convenient accessors for xsize/ysize, which shortens function
// argument lists. Supports move-construction so it can be stored in containers.
template <typename ComponentType> class Image {
 using Plane=ComparisonPlane<ComponentType,16,4>;
 std::unique_ptr<Plane> plane;mutable int checked=-1;
 void tick(size_t y)const{if(y%16==0&&checked!=int(y)){check("butteraugli",y,ysize());checked=y;}}
 public:using T=ComponentType;
 Image()=default;
 Image(size_t w,size_t h):plane(std::make_unique<Plane>(w,h)){}
 Image(size_t w,size_t h,T value):Image(w,h){for(size_t y=0;y<h;y++)std::fill_n(Row(y),w,value);}
 Image(Image&&)=default;Image&operator=(Image&&)=default;
 void Swap(Image&other){plane.swap(other.plane);}
 size_t xsize()const{return plane?plane->w:0;}size_t ysize()const{return plane?plane->h:0;}
 T*Row(size_t y){tick(y);return plane->output(y);}
 const T*Row(size_t y)const{tick(y);return plane->row(y);}
};

// Returns newly allocated planes of the given dimensions.
template <typename T>
static inline std::vector<Image<T>> CreatePlanes(const size_t xsize,
                                                 const size_t ysize,
                                                 const size_t num_planes) {
  std::vector<Image<T>> planes;
  planes.reserve(num_planes);
  for (size_t i = 0; i < num_planes; ++i) {
    planes.emplace_back(xsize, ysize);
  }
  return planes;
}

// Returns a new image with the same dimensions and pixel values.
template <typename T>
static inline Image<T> CopyPixels(const Image<T> &other) {
  Image<T> copy(other.xsize(), other.ysize());
  for(size_t y=0;y<other.ysize();y++)std::copy_n(other.Row(y),other.xsize(),copy.Row(y));
  return copy;
}

// Returns new planes with the same dimensions and pixel values.
template <typename T>
static inline std::vector<Image<T>> CopyPlanes(
    const std::vector<Image<T>> &planes) {
  std::vector<Image<T>> copy;
  copy.reserve(planes.size());
  for (const Image<T> &plane : planes) {
    copy.push_back(CopyPixels(plane));
  }
  return copy;
}

// Compacts a padded image into a preallocated packed vector.
template <typename T>
static inline void CopyToPacked(const Image<T> &from, std::vector<T> *to) {
  const size_t xsize = from.xsize();
  const size_t ysize = from.ysize();
#if BUTTERAUGLI_ENABLE_CHECKS
  if (to->size() < xsize * ysize) {
    printf("%zu x %zu exceeds %zu capacity\n", xsize, ysize, to->size());
    abort();
  }
#endif
  for (size_t y = 0; y < ysize; ++y) {
    const float* const BUTTERAUGLI_RESTRICT row_from = from.Row(y);
    float* const BUTTERAUGLI_RESTRICT row_to = to->data() + y * xsize;
    memcpy(row_to, row_from, xsize * sizeof(T));
  }
}

// Expands a packed vector into a preallocated padded image.
template <typename T>
static inline void CopyFromPacked(const std::vector<T> &from, Image<T> *to) {
  const size_t xsize = to->xsize();
  const size_t ysize = to->ysize();
  assert(from.size() == xsize * ysize);
  for (size_t y = 0; y < ysize; ++y) {
    const float* const BUTTERAUGLI_RESTRICT row_from =
        from.data() + y * xsize;
    float* const BUTTERAUGLI_RESTRICT row_to = to->Row(y);
    memcpy(row_to, row_from, xsize * sizeof(T));
  }
}

template <typename T>
static inline std::vector<Image<T>> PlanesFromPacked(
    const size_t xsize, const size_t ysize,
    const std::vector<std::vector<T>> &packed) {
  std::vector<Image<T>> planes;
  planes.reserve(packed.size());
  for (const std::vector<T> &p : packed) {
    planes.push_back(Image<T>(xsize, ysize));
    CopyFromPacked(p, &planes.back());
  }
  return planes;
}

template <typename T>
static inline std::vector<std::vector<T>> PackedFromPlanes(
    const std::vector<Image<T>> &planes) {
  assert(!planes.empty());
  const size_t num_pixels = planes[0].xsize() * planes[0].ysize();
  std::vector<std::vector<T>> packed;
  packed.reserve(planes.size());
  for (const Image<T> &image : planes) {
    packed.push_back(std::vector<T>(num_pixels));
    CopyToPacked(image, &packed.back());
  }
  return packed;
}

struct PsychoImage {
  std::vector<ImageF> uhf;
  std::vector<ImageF> hf;
  std::vector<ImageF> mf;
  std::vector<ImageF> lf;
};

class ButteraugliComparator {
 public:
  ButteraugliComparator(const std::vector<ImageF>& rgb0, double hf_asymmetry);

  // Computes the butteraugli map between the original image given in the
  // constructor and the distorted image give here.
  void Diffmap(const std::vector<ImageF>& rgb1, ImageF& result) const;

  // Same as above, but OpsinDynamicsImage() was already applied.
  void DiffmapOpsinDynamicsImage(const std::vector<ImageF>& xyb1,
                                 ImageF& result) const;

  // Same as above, but the frequency decomposition was already applied.
  void DiffmapPsychoImage(const PsychoImage& ps1, ImageF &result) const;

  void Mask(std::vector<ImageF>* BUTTERAUGLI_RESTRICT mask,
            std::vector<ImageF>* BUTTERAUGLI_RESTRICT mask_dc) const;

 private:
  void MaltaDiffMapLF(const ImageF& y0,
                      const ImageF& y1,
                      double w_0gt1,
                      double w_0lt1,
                      double normalization,
                      ImageF* BUTTERAUGLI_RESTRICT block_diff_ac) const;

  void MaltaDiffMap(const ImageF& y0,
                    const ImageF& y1,
                    double w_0gt1,
                    double w_0lt1,
                    double normalization,
                    ImageF* BUTTERAUGLI_RESTRICT block_diff_ac) const;

  ImageF CombineChannels(const std::vector<ImageF>& scale_xyb,
                         const std::vector<ImageF>& scale_xyb_dc,
                         const std::vector<ImageF>& block_diff_dc,
                         const std::vector<ImageF>& block_diff_ac) const;

  const size_t xsize_;
  const size_t ysize_;
  const size_t num_pixels_;
  float hf_asymmetry_;
  PsychoImage pi0_;
};

void ButteraugliDiffmap(const std::vector<ImageF> &rgb0,
                        const std::vector<ImageF> &rgb1,
                        double hf_asymmetry,
                        ImageF &diffmap);

double ButteraugliScoreFromDiffmap(const ImageF& distmap);

// Generate rgb-representation of the distance between two images.
void CreateHeatMapImage(const std::vector<float> &distmap,
                        double good_threshold, double bad_threshold,
                        size_t xsize, size_t ysize,
                        std::vector<uint8_t> *heatmap);

// Compute values of local frequency and dc masking based on the activity
// in the two images.
void Mask(const std::vector<ImageF>& xyb0,
          const std::vector<ImageF>& xyb1,
          std::vector<ImageF>* BUTTERAUGLI_RESTRICT mask,
          std::vector<ImageF>* BUTTERAUGLI_RESTRICT mask_dc);

template <class V>
BUTTERAUGLI_INLINE void RgbToXyb(const V &r, const V &g, const V &b,
                                 V *BUTTERAUGLI_RESTRICT valx,
                                 V *BUTTERAUGLI_RESTRICT valy,
                                 V *BUTTERAUGLI_RESTRICT valb) {
  *valx = r - g;
  *valy = r + g;
  *valb = b;
}

template <class V>
BUTTERAUGLI_INLINE void OpsinAbsorbance(const V &in0, const V &in1,
                                        const V &in2,
                                        V *BUTTERAUGLI_RESTRICT out0,
                                        V *BUTTERAUGLI_RESTRICT out1,
                                        V *BUTTERAUGLI_RESTRICT out2) {
  // https://en.wikipedia.org/wiki/Photopsin absorbance modeling.
  static const double mixi0 = 0.254462330846;
  static const double mixi1 = 0.488238255095;
  static const double mixi2 = 0.0635278003854;
  static const double mixi3 = 1.01681026909;
  static const double mixi4 = 0.195214015766;
  static const double mixi5 = 0.568019861857;
  static const double mixi6 = 0.0860755536007;
  static const double mixi7 = 1.1510118369;
  static const double mixi8 = 0.07374607900105684;
  static const double mixi9 = 0.06142425304154509;
  static const double mixi10 = 0.24416850520714256;
  static const double mixi11 = 1.20481945273;

  const V mix0(mixi0);
  const V mix1(mixi1);
  const V mix2(mixi2);
  const V mix3(mixi3);
  const V mix4(mixi4);
  const V mix5(mixi5);
  const V mix6(mixi6);
  const V mix7(mixi7);
  const V mix8(mixi8);
  const V mix9(mixi9);
  const V mix10(mixi10);
  const V mix11(mixi11);

  *out0 = mix0 * in0 + mix1 * in1 + mix2 * in2 + mix3;
  *out1 = mix4 * in0 + mix5 * in1 + mix6 * in2 + mix7;
  *out2 = mix8 * in0 + mix9 * in1 + mix10 * in2 + mix11;
}

std::vector<ImageF> OpsinDynamicsImage(const std::vector<ImageF>& rgb);

ImageF Blur(const ImageF& in, float sigma, float border_ratio);

double SimpleGamma(double v);

double GammaMinArg();
double GammaMaxArg();

// Polynomial evaluation via Clenshaw's scheme (similar to Horner's).
// Template enables compile-time unrolling of the recursion, but must reside
// outside of a class due to the specialization.
template <int INDEX>
static inline void ClenshawRecursion(const double x, const double *coefficients,
                                     double *b1, double *b2) {
  const double x_b1 = x * (*b1);
  const double t = (x_b1 + x_b1) - (*b2) + coefficients[INDEX];
  *b2 = *b1;
  *b1 = t;

  ClenshawRecursion<INDEX - 1>(x, coefficients, b1, b2);
}

// Base case
template <>
inline void ClenshawRecursion<0>(const double x, const double *coefficients,
                                 double *b1, double *b2) {
  const double x_b1 = x * (*b1);
  // The final iteration differs - no 2 * x_b1 here.
  *b1 = x_b1 - (*b2) + coefficients[0];
}

// Rational polynomial := dividing two polynomial evaluations. These are easier
// to find than minimax polynomials.
struct RationalPolynomial {
  template <int N>
  static double EvaluatePolynomial(const double x,
                                   const double (&coefficients)[N]) {
    double b1 = 0.0;
    double b2 = 0.0;
    ClenshawRecursion<N - 1>(x, coefficients, &b1, &b2);
    return b1;
  }

  // Evaluates the polynomial at x (in [min_value, max_value]).
  inline double operator()(const double x) const {
    // First normalize to [0, 1].
    const double x01 = (x - min_value) / (max_value - min_value);
    // And then to [-1, 1] domain of Chebyshev polynomials.
    const double xc = 2.0 * x01 - 1.0;

    const double yp = EvaluatePolynomial(xc, p);
    const double yq = EvaluatePolynomial(xc, q);
    if (yq == 0.0) return 0.0;
    return static_cast<float>(yp / yq);
  }

  // Domain of the polynomials; they are undefined elsewhere.
  double min_value;
  double max_value;

  // Coefficients of T_n (Chebyshev polynomials of the first kind).
  // Degree 5/5 is a compromise between accuracy (0.1%) and numerical stability.
  double p[5 + 1];
  double q[5 + 1];
};

static inline double GammaPolynomial(double value) {
  static const RationalPolynomial r = {
    0.971783, 590.188894,
    {
      98.7821300963361, 164.273222212631, 92.948112871376,
      33.8165311212688, 6.91626704983562, 0.556380877028234
    },
    {
      1, 1.64339473427892, 0.89392405219969, 0.298947051776379,
      0.0507146002577288, 0.00226495093949756
    }};
  return r(value);
}

}  // namespace butteraugli

#endif  // BUTTERAUGLI_BUTTERAUGLI_H_
