/*M///////////////////////////////////////////////////////////////////////////////////////
//
//  IMPORTANT: READ BEFORE DOWNLOADING, COPYING, INSTALLING OR USING.
//
//  By downloading, copying, installing or using the software you agree to this license.
//  If you do not agree to this license, do not download, install,
//  copy or use the software.
//
//
//                           License Agreement
//                For Open Source Computer Vision Library
//
// Copyright (C) 2000-2008, 2017, Intel Corporation, all rights reserved.
// Copyright (C) 2009, Willow Garage Inc., all rights reserved.
// Copyright (C) 2014-2015, Itseez Inc., all rights reserved.
// Third party copyrights are property of their respective owners.
//
// Redistribution and use in source and binary forms, with or without modification,
// are permitted provided that the following conditions are met:
//
//   * Redistribution's of source code must retain the above copyright notice,
//     this list of conditions and the following disclaimer.
//
//   * Redistribution's in binary form must reproduce the above copyright notice,
//     this list of conditions and the following disclaimer in the documentation
//     and/or other materials provided with the distribution.
//
//   * The name of the copyright holders may not be used to endorse or promote products
//     derived from this software without specific prior written permission.
//
// This software is provided by the copyright holders and contributors "as is" and
// any express or implied warranties, including, but not limited to, the implied
// warranties of merchantability and fitness for a particular purpose are disclaimed.
// In no event shall the Intel Corporation or contributors be liable for any direct,
// indirect, incidental, special, exemplary, or consequential damages
// (including, but not limited to, procurement of substitute goods or services;
// loss of use, data, or profits; or business interruption) however caused
// and on any theory of liability, whether in contract, strict liability,
// or tort (including negligence or otherwise) arising in any way out of
// the use of this software, even if advised of the possibility of such damage.
//
//M*/

// Additive private support adapter derived from OpenCV4.11 resize.cpp.
// Original source/ABI remains unchanged. Native coefficient quantization and
// uchar horizontal/vertical arithmetic are retained with FP contraction off.
// Only true missing taps change address; admitted adjacent-rectangle taps do not.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cfloat>
#include <cstdint>
#include <limits>
#include <memory>
#include <string>
#include <vector>

namespace {
struct Axis { int base; short a0, a1; };
struct Rect { int x0, y0, x1, y1; };
struct ColourPlan {
  int width, height, outWidth, outHeight;
  bool full, area2;
  std::vector<uint32_t> destinations, anchors, taps, packedOffsets;
  std::vector<int16_t> coefficients;
  std::vector<int32_t> owners;
  std::vector<uint8_t> clamped;
};
std::string colourError;
inline int bounded(int v, int lo, int hi) { return std::min(std::max(v, lo), hi); }
Axis axis(int out, double scale, int length, bool horizontal) {
  float f = static_cast<float>((out + .5) * scale - .5);
  int s = cvFloor(f);
  f -= s;
  // This asymmetry is native: x border changes coefficient; y border is
  // handled by duplicated source rows while retaining the original beta.
  if (horizontal && s < 0) { s = 0; f = 0; }
  if (horizontal && s >= length - 1) { s = length - 1; f = 0; }
  return {s, cv::saturate_cast<short>((1.f - f) * 2048), cv::saturate_cast<short>(f * 2048)};
}
ColourPlan* makePlan(const uint32_t* indices, int count, const int32_t* rectangles,
                     int rectCount, int width, int height, int outWidth, int outHeight) {
  CV_Assert(width > 0 && height > 0 && outWidth > 0 && outHeight > 0 && count >= 0 && rectCount >= 0);
  const int64_t area64 = static_cast<int64_t>(width) * height, out64 = static_cast<int64_t>(outWidth) * outHeight;
  CV_Assert(area64 <= std::numeric_limits<int>::max() && out64 <= std::numeric_limits<int>::max() && count <= area64);
  CV_Assert((count == 0 || indices) && (rectCount == 0 || rectangles));
  const int area = static_cast<int>(area64), outputArea = static_cast<int>(out64);
  // These are address/presence maps, never RGB fill rasters. Caller admits
  // their complete native scratch before this constructor is entered.
  std::vector<int32_t> positions(area, -1), owner(area, -1);
  for (int k = 0; k < count; k++) {
    CV_Assert(indices[k] < static_cast<uint32_t>(area) && (k == 0 || indices[k] > indices[k - 1]));
    positions[indices[k]] = k;
  }
  std::vector<Rect> rects;
  rects.reserve(rectCount);
  for (int k = 0; k < rectCount; k++) {
    const int32_t* a = rectangles + k * 4;
    const Rect r{a[0], a[1], a[2], a[3]};
    CV_Assert(r.x0 >= 0 && r.y0 >= 0 && r.x1 <= width && r.y1 <= height && r.x1 > r.x0 && r.y1 > r.y0);
    for (int y = r.y0; y < r.y1; y++) for (int x = r.x0; x < r.x1; x++) {
      const int at = y * width + x;
      CV_Assert(positions[at] >= 0 && owner[at] == -1);
      owner[at] = k;
    }
    rects.push_back(r);
  }
  for (int k = 0; k < count; k++) CV_Assert(owner[indices[k]] >= 0);
  const double invX = static_cast<double>(outWidth) / width, invY = static_cast<double>(outHeight) / height;
  const double scaleX = 1. / invX, scaleY = 1. / invY;
  const int iscaleX = cv::saturate_cast<int>(scaleX), iscaleY = cv::saturate_cast<int>(scaleY);
  const bool area2 = std::abs(scaleX - iscaleX) < DBL_EPSILON && std::abs(scaleY - iscaleY) < DBL_EPSILON && iscaleX == 2 && iscaleY == 2;
  std::vector<Axis> xs(outWidth), ys(outHeight);
  for (int x = 0; x < outWidth; x++) xs[x] = axis(x, scaleX, width, true);
  for (int y = 0; y < outHeight; y++) ys[y] = axis(y, scaleY, height, false);
  int admitted = 0;
  for (int y = 0; y < outHeight; y++) for (int x = 0; x < outWidth; x++)
    admitted += positions[bounded(ys[y].base, 0, height - 1) * width + bounded(xs[x].base, 0, width - 1)] >= 0;
  std::unique_ptr<ColourPlan> p(new ColourPlan{width, height, outWidth, outHeight, count == area, area2});
  p->destinations.resize(admitted); p->anchors.resize(admitted);
  p->taps.resize(static_cast<size_t>(admitted) * 4); p->packedOffsets.resize(static_cast<size_t>(admitted) * 4);
  p->coefficients.resize(static_cast<size_t>(admitted) * 4); p->owners.resize(admitted); p->clamped.resize(admitted);
  int next = 0;
  for (int y = 0; y < outHeight; y++) for (int x = 0; x < outWidth; x++) {
    const Axis ax = xs[x], ay = ys[y];
    const int anchor = bounded(ay.base, 0, height - 1) * width + bounded(ax.base, 0, width - 1);
    if (positions[anchor] < 0) continue; // Absent anchor is not an observation.
    const int own = owner[anchor]; const Rect r = rects[own];
    p->destinations[next] = static_cast<uint32_t>(y * outWidth + x); p->anchors[next] = anchor; p->owners[next] = own;
    const short coeff[4] = {ax.a0, ax.a1, ay.a0, ay.a1};
    std::copy(coeff, coeff + 4, p->coefficients.data() + next * 4);
    uint8_t flags = 0;
    for (int tap = 0; tap < 4; tap++) {
      int tx = bounded(ax.base + (tap & 1), 0, width - 1), ty = bounded(ay.base + (tap >> 1), 0, height - 1);
      int at = ty * width + tx;
      if (positions[at] < 0) {
        // Never clamp a present tap merely because another canonical rectangle
        // owns it. Clamp only true absence to the literal admitted owner border.
        tx = bounded(tx, r.x0, r.x1 - 1); ty = bounded(ty, r.y0, r.y1 - 1);
        at = ty * width + tx; flags |= static_cast<uint8_t>(1 << tap);
        CV_Assert(positions[at] >= 0); // Keep a causal refusal if addressing fails.
      }
      p->taps[next * 4 + tap] = at; p->packedOffsets[next * 4 + tap] = positions[at];
    }
    p->clamped[next] = flags; next++;
  }
  CV_Assert(next == admitted && (!p->full || admitted == outputArea));
  return p.release();
}
void render(const ColourPlan& p, const uint8_t* packed, uint8_t* out, bool forceTaps) {
  CV_Assert((p.destinations.empty() || (packed && out)));
  if (p.full && !forceTaps) {
    cv::Mat source(p.height, p.width, CV_8UC3, const_cast<uint8_t*>(packed));
    cv::Mat target(p.outHeight, p.outWidth, CV_8UC3, out);
    cv::resize(source, target, target.size(), 0, 0, cv::INTER_LINEAR);
    return;
  }
  for (size_t k = 0; k < p.destinations.size(); k++) {
    const uint32_t* at = p.packedOffsets.data() + k * 4;
    const int16_t* a = p.coefficients.data() + k * 4;
    for (int c = 0; c < 3; c++) {
      const int q0 = packed[at[0] * 3 + c], q1 = packed[at[1] * 3 + c], q2 = packed[at[2] * 3 + c], q3 = packed[at[3] * 3 + c];
      if (p.area2) out[k * 3 + c] = static_cast<uint8_t>((q0 + q1 + q2 + q3 + 2) >> 2);
      else {
        const int s0 = q0 * a[0] + q1 * a[1], s1 = q2 * a[0] + q3 * a[1];
        // OpenCV4.11 VResizeLinear<uchar,int,short> scalar path, unchanged.
        out[k * 3 + c] = static_cast<uint8_t>((((a[2] * (s0 >> 4)) >> 16) + ((a[3] * (s1 >> 4)) >> 16) + 2) >> 2);
      }
    }
  }
}
}

extern "C" {
const char* proposal_colour_error() { return colourError.c_str(); }
uintptr_t proposal_colour_plan(const uint32_t* indices, int count, const int32_t* rectangles, int rectCount,
                               int width, int height, int outWidth, int outHeight) {
  colourError.clear();
  try { return reinterpret_cast<uintptr_t>(makePlan(indices, count, rectangles, rectCount, width, height, outWidth, outHeight)); }
  catch (const std::exception& e) { colourError = e.what(); return 0; }
}
int proposal_colour_count(uintptr_t handle) { const auto* p = reinterpret_cast<const ColourPlan*>(handle); return p ? static_cast<int>(p->destinations.size()) : -1; }
int proposal_colour_mode(uintptr_t handle) { const auto* p = reinterpret_cast<const ColourPlan*>(handle); return p ? (p->area2 ? 1 : 0) : -1; }
uintptr_t proposal_colour_trace(uintptr_t handle, int field) {
  const auto* p = reinterpret_cast<const ColourPlan*>(handle); if (!p) return 0;
  switch (field) { case 0: return reinterpret_cast<uintptr_t>(p->destinations.data()); case 1: return reinterpret_cast<uintptr_t>(p->anchors.data()); case 2: return reinterpret_cast<uintptr_t>(p->taps.data()); case 3: return reinterpret_cast<uintptr_t>(p->coefficients.data()); case 4: return reinterpret_cast<uintptr_t>(p->owners.data()); case 5: return reinterpret_cast<uintptr_t>(p->clamped.data()); case 6: return reinterpret_cast<uintptr_t>(p->packedOffsets.data()); default: return 0; }
}
int proposal_colour_render(uintptr_t handle, const uint8_t* packed, uint8_t* out) {
  colourError.clear(); try { CV_Assert(handle); render(*reinterpret_cast<ColourPlan*>(handle), packed, out, false); return 0; }
  catch (const std::exception& e) { colourError = e.what(); return -1; }
}
// Private qualification only: tests native tap arithmetic on a full source
// too. Product use of the whole rectangle always takes the direct cv::resize.
int proposal_colour_render_taps_control(uintptr_t handle, const uint8_t* packed, uint8_t* out) {
  colourError.clear(); try { CV_Assert(handle); render(*reinterpret_cast<ColourPlan*>(handle), packed, out, true); return 0; }
  catch (const std::exception& e) { colourError = e.what(); return -1; }
}
void proposal_colour_release(uintptr_t handle) { delete reinterpret_cast<ColourPlan*>(handle); }
}
