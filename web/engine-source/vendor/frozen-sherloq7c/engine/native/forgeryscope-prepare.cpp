// Public Forgeryscope Albumentations 2.0.8 preprocessing; OpenCV 4.11 uint8 resize.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/calib3d.hpp>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <numeric>

extern "C" int fg_prepare(const uint8_t* rgb, int width, int height,
    int out_width, int out_height, int longest, const float* mean,
    const float* stddev, float* output) {
  if (!rgb || !output || !mean || !stddev || width < 1 || height < 1 ||
      out_width < 1 || out_height < 1 || (longest != 0 && longest != 1)) return 0;
  for (int c = 0; c < 3; c++) if (!std::isfinite(mean[c]) || !std::isfinite(stddev[c]) || stddev[c] <= 0) return 0;
  try {
    cv::setNumThreads(1);
    cv::Mat src(height, width, CV_8UC3, const_cast<uint8_t*>(rgb)), resized, padded;
    if (longest) {
      const double scale = double(out_width) / std::max(height, width);
      // Python round uses ties-to-even, unlike std::round.
      const int w = std::max(1, int(std::nearbyint(width * scale)));
      const int h = std::max(1, int(std::nearbyint(height * scale)));
      cv::resize(src, resized, {w, h}, 0, 0, cv::INTER_LINEAR);
      const int dh = std::max(0, out_height - h), dw = std::max(0, out_width - w);
      cv::copyMakeBorder(resized, padded, dh/2, dh-dh/2, dw/2, dw-dw/2, cv::BORDER_CONSTANT, cv::Scalar(0,0,0));
      cv::resize(padded, resized, {out_width, out_height}, 0, 0, cv::INTER_LINEAR);
    } else cv::resize(src, resized, {out_width, out_height}, 0, 0, cv::INTER_LINEAR);
    float lut[3][256];
    for (int c = 0; c < 3; c++) {
      const float m = mean[c] * 255.f, denominator = 1.f / (stddev[c] * 255.f);
      for (int v = 0; v < 256; v++) lut[c][v] = (float(v) - m) * denominator;
    }
    const int64_t n = int64_t(out_width) * out_height;
    for (int y = 0; y < out_height; y++) for (int x = 0; x < out_width; x++)
      for (int c = 0; c < 3; c++) output[c*n+y*out_width+x] = lut[c][resized.ptr<uint8_t>(y)[3*x+c]];
    return 1;
  } catch (...) {return 0;}
}

extern "C" int fg_yolo_prepare(const uint8_t* rgb, int width, int height,
    int side, int stride, float* output, int* dimensions) {
  if (!rgb || !output || !dimensions || width < 1 || height < 1 || side < 1 || stride < 1) return 0;
  try {
    cv::setNumThreads(1);
    const double gain = std::min(double(side)/width, double(side)/height);
    const int w = int(std::nearbyint(width*gain)), h = int(std::nearbyint(height*gain));
    if (w < 1 || h < 1) return 0;
    const int dw = (side-w)%stride, dh = (side-h)%stride;
    const int left = int(std::nearbyint(dw/2.-.1)), top = int(std::nearbyint(dh/2.-.1));
    cv::Mat src(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)), resized, padded;
    cv::resize(src,resized,{w,h},0,0,cv::INTER_LINEAR);
    cv::copyMakeBorder(resized,padded,top,dh-top,left,dw-left,cv::BORDER_CONSTANT,cv::Scalar(114,114,114));
    const int n = padded.rows*padded.cols;
    for(int y=0;y<padded.rows;y++)for(int x=0;x<padded.cols;x++)for(int c=0;c<3;c++)
      output[c*n+y*padded.cols+x]=float(padded.ptr<uint8_t>(y)[3*x+2-c])/255.f;
    dimensions[0]=padded.cols; dimensions[1]=padded.rows;
    return 1;
  } catch (...) {return 0;}
}

// Native CPU torch.sort uses the C++ unstable descending comparison. Keeping
// sorting here also preserves its tie permutation (a stable JS sort does not).
extern "C" int fg_aliked_select(const float* scores, const float* nms,
    int width, int height, float mean, int* selected) {
  if (!scores || !nms || !selected || width < 5 || height < 5) return -1;
  try {
    std::vector<int> indices;
    for (int pass = 0; pass < 2; ++pass) {
      const float threshold = pass == 0 ? .2f : mean;
      for (int y = 2; y < height-2; ++y) for (int x = 2; x < width-2; ++x)
        if (nms[y*width+x] > threshold) indices.push_back(y*width+x);
      if (!indices.empty()) break;
    }
    if (indices.size() > 512) {
      std::sort(indices.begin(), indices.end(), [&](int a, int b) {return scores[a] > scores[b];});
      indices.resize(512);
    }
    std::copy(indices.begin(), indices.end(), selected);
    return int(indices.size());
  } catch (...) {return -1;}
}

// Both native estimators use fixed OpenCV defaults, not a substitute RANSAC.
extern "C" int fg_affine(const float* points0, const float* points1, int count,
    int blot, double* matrix, uint8_t* inliers) {
  if (!points0 || !points1 || !matrix || !inliers || count < 4) return 0;
  try {
    cv::setNumThreads(1);
    cv::Mat p0(count,1,CV_32FC2,const_cast<float*>(points0));
    cv::Mat p1(count,1,CV_32FC2,const_cast<float*>(points1));
    cv::Mat selected, transform;
    if (blot) transform=cv::estimateAffine2D(p1,p0,selected,cv::USAC_MAGSAC,3.,5000,.9999,10);
    else transform=cv::estimateAffinePartial2D(p1,p0,selected,cv::RANSAC,5.,5000,.9999,10);
    if (transform.empty()) return 0;
    std::copy(transform.ptr<double>(),transform.ptr<double>()+6,matrix);
    std::copy(selected.ptr<uint8_t>(),selected.ptr<uint8_t>()+count,inliers);
    return 1;
  } catch (...) {return -1;}
}

// Candidate order is the original flattened score order. Sorting positions
// uses the identical native comparator/tie permutation without a dense map.
extern "C" int fg_aliked_candidates(const int* indices, const float* scores,
    int count, int* selected) {
  if (!indices || !scores || !selected || count < 0) return -1;
  try {
    std::vector<int> order(count); std::iota(order.begin(), order.end(), 0);
    if (count > 512) {
      std::sort(order.begin(), order.end(), [&](int a, int b) {return scores[a] > scores[b];});
      order.resize(512);
    }
    for (size_t i=0;i<order.size();i++) selected[i]=indices[order[i]];
    return int(order.size());
  } catch (...) {return -1;}
}
