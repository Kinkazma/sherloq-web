// Local qualification wrapper around unmodified OpenCV4.11 SEEDS.
// Input byte channels stay exactly as passed by upstream Proposal SuperGlue.
#include <opencv2/core.hpp>
#include <opencv2/ximgproc/seeds.hpp>
#include <opencv2/imgproc.hpp>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

static std::string error;
extern "C" {
const char* proposal_seeds_error() { return error.c_str(); }
int proposal_seeds(const uint8_t* pixels, int width, int height, int32_t* labels) {
  error.clear();
  try {
    if (!pixels || !labels || width <= 0 || height <= 0) {
      error = "Invalid SEEDS tensor";
      return -1;
    }
    cv::Mat image(height, width, CV_8UC3, const_cast<uint8_t*>(pixels));
    auto engine = cv::ximgproc::createSuperpixelSEEDS(width, height, 3, 400, 15, 3, 5, true);
    engine->iterate(image, 10);
    cv::Mat output;
    engine->getLabels(output);
    if (output.type() != CV_32SC1 || output.rows != height || output.cols != width || !output.isContinuous()) {
      error = "Unexpected SEEDS output tensor";
      return -1;
    }
    std::memcpy(labels, output.data, static_cast<size_t>(width) * height * sizeof(int32_t));
    return engine->getNumberOfSuperpixels();
  } catch (const cv::Exception& failure) {
    error = failure.what();
    return -1;
  } catch (const std::exception& failure) {
    error = failure.what();
    return -1;
  }
}

int proposal_prepare_roi(const uint8_t* pixels, int width, int height,
                         int x, int y, int roi_width, int roi_height,
                         int out_width, int out_height, float* gray_out, uint8_t* color_out) {
  error.clear();
  try {
    cv::Mat image(height, width, CV_8UC3, const_cast<uint8_t*>(pixels));
    cv::Mat crop = image(cv::Rect(x, y, roi_width, roi_height));
    cv::Mat gray8, gray;
    // This apparently reversed convention is exactly the pinned caller:
    // PIL RGB bytes are processed with COLOR_BGR2GRAY by proposals_utils.py.
    cv::cvtColor(crop, gray8, cv::COLOR_BGR2GRAY);
    gray8.convertTo(gray, CV_32F);
    cv::Mat gray_target(out_height, out_width, CV_32FC1, gray_out);
    cv::Mat color_target(out_height, out_width, CV_8UC3, color_out);
    cv::resize(gray, gray_target, gray_target.size(), 0, 0, cv::INTER_LINEAR);
    cv::resize(crop, color_target, color_target.size(), 0, 0, cv::INTER_LINEAR);
    return 0;
  } catch (const cv::Exception& failure) { error = failure.what(); return -1; }
}

int proposal_mask_box(const float* probabilities, int width, int height,
                       double scale, int grid_row, int grid_col, int32_t* rectangle) {
  error.clear();
  try {
    cv::Mat mask(112, 112, CV_32FC1, const_cast<float*>(probabilities));
    cv::Mat enlarged, projected, binary;
    cv::resize(mask, enlarged, cv::Size(160, 160), 0, 0, cv::INTER_LINEAR);
    const double a = (width - 1) / (width * scale), b = (height - 1) / (height * scale);
    cv::Matx23d mapping(a, 0, -a * (80 - 16 * grid_col), 0, b, -b * (80 - 16 * grid_row));
    cv::warpAffine(enlarged, projected, mapping, cv::Size(width, height), cv::INTER_LINEAR, cv::BORDER_CONSTANT, 0);
    cv::compare(projected, .2, binary, cv::CMP_GT);
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(binary, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_NONE);
    if (contours.empty()) return 0;
    size_t largest = 0;
    double area = cv::contourArea(contours[0]);
    for (size_t i = 1; i < contours.size(); i++) {
      const double next = cv::contourArea(contours[i]);
      if (next > area) { area = next; largest = i; }
    }
    cv::Rect box = cv::boundingRect(contours[largest]);
    rectangle[0] = box.x; rectangle[1] = box.y;
    rectangle[2] = box.x + box.width; rectangle[3] = box.y + box.height;
    return 1;
  } catch (const cv::Exception& failure) { error = failure.what(); return -1; }
}

int proposal_resize_float(const float* source, int width, int height,
                          int out_width, int out_height, float* output) {
  error.clear();
  try {
    cv::Mat input(height, width, CV_32FC1, const_cast<float*>(source));
    cv::Mat target(out_height, out_width, CV_32FC1, output);
    cv::resize(input, target, target.size(), 0, 0, cv::INTER_LINEAR);
    return 0;
  } catch (const cv::Exception& failure) { error = failure.what(); return -1; }
}
}
