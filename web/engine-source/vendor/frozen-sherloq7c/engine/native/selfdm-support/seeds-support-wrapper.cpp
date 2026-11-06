// Private C ABI for the additive support fork. OpenCV sources/license remain
// in place; the included fork preserves their copyright and implementation.
#include "seeds-support.cpp"
#include <string>
#include <memory>

namespace {
struct SeedsSupportOwner {
    cv::Ptr<cv::ximgproc::SuperpixelSEEDS> engine;
    cv::ximgproc::SuperpixelSEEDSSupportImpl* support;
    int width, height, count;
    bool ran = false;
};
std::string supportError;
uintptr_t createSupport(int width, int height, const uint32_t* indices, int count, bool forceFork) {
    CV_Assert(width > 0 && height > 0 && static_cast<int64_t>(width) * height <= INT_MAX && count >= 0 && count <= width * height && (count == 0 || indices));
    for (int k = 0; k < count; k++) CV_Assert(indices[k] < static_cast<uint32_t>(width * height) && (k == 0 || indices[k] > indices[k - 1]));
    if (count == width * height && !forceFork) {
        auto engine = cv::ximgproc::createSuperpixelSEEDS(width, height, 3, 400, 15, 3, 5, true);
        return reinterpret_cast<uintptr_t>(new SeedsSupportOwner{engine, nullptr, width, height, count});
    }
    auto engine = cv::ximgproc::createSuperpixelSEEDSSupport(width, height, 3, 400, 15, 3, 5, true, indices, count);
    return reinterpret_cast<uintptr_t>(new SeedsSupportOwner{engine, static_cast<cv::ximgproc::SuperpixelSEEDSSupportImpl*>(engine.get()), width, height, count});
}
}
extern "C" {
const char* proposal_seeds_support_error() { return supportError.c_str(); }
uintptr_t proposal_seeds_support_create(int width, int height, const uint32_t* indices, int count) {
    supportError.clear();
    try {
        return createSupport(width, height, indices, count, false);
    } catch (const std::exception& error) { supportError = error.what(); return 0; }
}
// Private qualification control, so the additive guards can also be compared
// to the unchanged original on a complete rectangle. Product uses create().
uintptr_t proposal_seeds_support_create_fork_control(int width, int height, const uint32_t* indices, int count) {
    supportError.clear();
    try { return createSupport(width, height, indices, count, true); }
    catch (const std::exception& error) { supportError = error.what(); return 0; }
}
int proposal_seeds_support_run(uintptr_t handle, const uint8_t* packed, int32_t* labels) {
    supportError.clear();
    try {
        auto* p = reinterpret_cast<SeedsSupportOwner*>(handle);
        CV_Assert(p && !p->ran && labels && (p->count == 0 || packed));
        if (p->count == 0) { std::fill(labels, labels + p->width * p->height, -1); p->ran = true; return 0; }
        cv::Mat image(p->support ? 1 : p->height, p->support ? p->count : p->width, CV_8UC3, const_cast<uint8_t*>(packed));
        p->engine->iterate(image, 10); cv::Mat value; p->engine->getLabels(value);
        CV_Assert(value.rows == p->height && value.cols == p->width && value.type() == CV_32SC1 && value.isContinuous());
        std::copy(value.ptr<int32_t>(), value.ptr<int32_t>() + p->width * p->height, labels);
        p->ran = true; return p->engine->getNumberOfSuperpixels();
    } catch (const std::exception& error) { supportError = error.what(); return -1; }
}
int proposal_seeds_support_levels(uintptr_t handle) { auto* p = reinterpret_cast<SeedsSupportOwner*>(handle); return p && p->support ? p->support->supportLevels() : -1; }
int proposal_seeds_support_labels(uintptr_t handle, int level) { auto* p = reinterpret_cast<SeedsSupportOwner*>(handle); return p && p->support && level >= 0 && level < p->support->supportLevels() ? p->support->supportLabelsCount(level) : -1; }
int proposal_seeds_support_histogram_stride(uintptr_t handle) { auto* p = reinterpret_cast<SeedsSupportOwner*>(handle); return p && p->support ? p->support->supportHistogramStride() : -1; }
uintptr_t proposal_seeds_support_trace(uintptr_t handle, int field, int level) {
    auto* p = reinterpret_cast<SeedsSupportOwner*>(handle); if (!p || !p->support || !p->ran || !p->count) return 0;
    if (field == 3) return reinterpret_cast<uintptr_t>(p->support->supportMetrics());
    if (field == 2) return reinterpret_cast<uintptr_t>(p->support->supportPartitions());
    if (level < 0 || level >= p->support->supportLevels()) return 0;
    if (field == 0) return reinterpret_cast<uintptr_t>(p->support->supportHistogram(level));
    if (field == 1) return reinterpret_cast<uintptr_t>(p->support->supportMasses(level));
    return 0;
}
void proposal_seeds_support_release(uintptr_t handle) { delete reinterpret_cast<SeedsSupportOwner*>(handle); }
}
