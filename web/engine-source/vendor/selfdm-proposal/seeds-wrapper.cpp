// Local qualification wrapper around unmodified OpenCV4.11 SEEDS.
// Input byte channels stay exactly as passed by upstream Proposal SuperGlue.
#include <opencv2/core.hpp>
#include <opencv2/ximgproc/seeds.hpp>
#include <opencv2/imgproc.hpp>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <cmath>

static std::string error;
static float interpolate(float a,float b,float wa,float wb,int mode) {
  if(mode==1)return std::fma(a,wa,b*wb);
  if(mode==2)return std::fma(b,wb,a*wa);
  return a*wa+b*wb;
}
extern "C" {
// Source PyTorch align_corners=True. A window uses global interpolation
// coordinates; no whole-pyramid allocation and no implicit source downscale.
int proposal_pyramid_patch(const uint8_t* rgb,int iw,int ih,int ow,int oh,
                          int wx,int wy,int ww,int wh,int px,int py,int pw,int ph,int fused,float* output) {
  if(!rgb||!output||iw<1||ih<1||ow<1||oh<1||wx<0||wy<0||ww<1||wh<1||wx+ww>ow+160||wy+wh>oh+160)return -1;
  const float means[3]={.485f,.456f,.406f},stds[3]={.229f,.224f,.225f};
  const float sx=ow>1?float(iw-1)/float(ow-1):0.f,sy=oh>1?float(ih-1)/float(oh-1):0.f;
  for(int c=0;c<3;c++)for(int y=0;y<wh;y++)for(int x=0;x<ww;x++) {
    const int ox=wx+x-80,oy=wy+y-80;float value=.5f;
    if(ox>=0&&oy>=0&&ox<ow&&oy<oh) {
      const float fx=sx*ox,fy=sy*oy;
      const int x0=std::min(int(std::floor(fx)),iw-1),x1=std::min(x0+1,iw-1);
      const int y0=std::min(int(std::floor(fy)),ih-1),y1=std::min(y0+1,ih-1);
      if(x0<px||y0<py||x1>=px+pw||y1>=py+ph)return -1;
      const float lx=std::clamp(fx-x0,0.f,1.f),ly=std::clamp(fy-y0,0.f,1.f),hx=1.f-lx,hy=1.f-ly;
      const float a=float(rgb[((y0-py)*pw+x0-px)*3+c])/255.f,b=float(rgb[((y0-py)*pw+x1-px)*3+c])/255.f;
      const float d=float(rgb[((y1-py)*pw+x0-px)*3+c])/255.f,e=float(rgb[((y1-py)*pw+x1-px)*3+c])/255.f;
      const float top=interpolate(a,b,hx,lx,fused%3),bottom=interpolate(d,e,hx,lx,fused%3);
      value=interpolate(top,bottom,hy,ly,fused/3);
    }
    output[(c*wh+y)*ww+x]=(value-means[c])/stds[c];
  }
  return 0;
}
int proposal_pyramid_window(const uint8_t* rgb,int iw,int ih,int ow,int oh,
                           int wx,int wy,int ww,int wh,int fused,float* output) {
  return proposal_pyramid_patch(rgb,iw,ih,ow,oh,wx,wy,ww,wh,0,0,iw,ih,fused,output);
}
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
    const double tx=-a*(80-16*grid_col),ty=-b*(80-16*grid_row);
    // A160×160 source mask cannot contribute outside its transformed support.
    // Keep the interpolation border, intersect with original-image bounds and
    // translate only the destination origin. No full-image scratch per mask.
    const int x=std::max(0,int(std::floor(tx))-2),y=std::max(0,int(std::floor(ty))-2);
    const int ex=std::min(width,int(std::ceil(tx+a*160))+2),ey=std::min(height,int(std::ceil(ty+b*160))+2);
    if(ex<=x||ey<=y)return 0;
    cv::Matx23d mapping(a,0,tx-x,0,b,ty-y);
    cv::warpAffine(enlarged, projected, mapping, cv::Size(ex-x,ey-y), cv::INTER_LINEAR, cv::BORDER_CONSTANT, 0);
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
    rectangle[0] = box.x+x; rectangle[1] = box.y+y;
    rectangle[2] = box.x+x+box.width; rectangle[3] = box.y+y+box.height;
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
