#pragma once
#include <cstdint>
#include <climits>
// cv::Mat dimensions and the detector's linear pixel offsets use signed int.
// Widen before multiplication; allocation failures are handled by the caller.
static inline bool m3ImageShape(int width,int height,int minimum=1){
 return width>=minimum && height>=minimum && int64_t(width)*height<=INT_MAX;
}
