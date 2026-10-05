// Offline diagnostic only; no runtime entry point. Capture before atan2f.
#include <vector>
#include <cmath>
static std::vector<double> captured;
extern "C" {
void brisk_capture(int x, int y) { captured.push_back(x); captured.push_back(y); }
void brisk_reset() { captured.clear(); }
const double* brisk_values() { return captured.data(); }
int brisk_direction_count() { return static_cast<int>(captured.size()/2); }
float brisk_angle(int x, int y) { return static_cast<float>(std::atan2(static_cast<float>(y),static_cast<float>(x))/3.1415926535897932384626433832795*180.0); }
}
