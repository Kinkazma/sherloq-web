"""Adapt vendored helper command lines to memory-only grayscale entry points.
Original sources and license notices remain in vendor/comparison.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'vendor/comparison/ssimulacra/ssimulacra.cpp').read_text()
constants=source[source.index('const double C1'):source.index('int main(')]
body=source[source.index('    Scalar sC1'):]
a=body.index('    // read and validate input images');b=body.index('    int pixels =')
body=body[:a]+'''    cv::cvtColor(first,img1_temp,cv::COLOR_BGR2GRAY);
    cv::cvtColor(second,img2_temp,cv::COLOR_BGR2GRAY);
    const int nChan=1;
    if(img1_temp.cols<8||img1_temp.rows<8)return NAN;
'''+body[b:]
body=body.replace('    printf("%.8f\\n", dssim);\n\n    return(0);','    char formatted[64];std::snprintf(formatted,sizeof(formatted),"%.8f",dssim);\n    return std::strtod(formatted,nullptr);')
assert 'printf("%.8f' not in body and 'argv' not in body
body=body.replace('resize(img1, img1, Size(), 0.5, 0.5, INTER_AREA);','comparisonAreaHalf(img1,img1);').replace('resize(img2, img2, Size(), 0.5, 0.5, INTER_AREA);','comparisonAreaHalf(img2,img2);')
body=body.replace('mean(', 'comparisonMean32(')
body=body.replace('GaussianBlur(', 'cv::sherloqStereoGaussian(').replace('Size(11,11), 1.5);', 'Size(11,11), 1.5, 1.5);')
body=body.replace('ssim_map = ((2*mu1_mu2 + sC1).mul(2*sigma12 + sC2))/((mu1_sq + mu2_sq + sC1).mul(sigma1_sq + sigma2_sq + sC2));','Mat ct1=2*mu1_mu2+sC1,ct2=2*sigma12+sC2,ct3=mu1_sq+mu2_sq+sC1,ct4=sigma1_sq+sigma2_sq+sC2,ctnum=ct1.mul(ct2),ctden=ct3.mul(ct4);ssim_map=comparisonDivide(ctnum,ctden);')
ssim='// Generated from vendor/comparison/ssimulacra/ssimulacra.cpp; retain its notices.\n#include <set>\n#include <cstdio>\n#include <cstdlib>\nnamespace comparisonSsimulacra {\nusing namespace std;using namespace cv;\n'+constants+'\nstatic double compute(const cv::Mat& first,const cv::Mat& second){\n'+body+'\n}\n'
(ROOT/'.build/comparison-ssimulacra.h').write_text(ssim)
source=(ROOT/'vendor/comparison/butteraugli/butteraugli_main.cc').read_text()
a=source.index('static void ScoreToRgb');b=source.index('// main() function,')
heatmap=source[a:b]
(ROOT/'.build/comparison-butteraugli.h').write_text('''// Generated from the retained Apache-2.0 Butteraugli source.
#include "../vendor/comparison/butteraugli/butteraugli.h"
namespace comparisonButteraugli {
using namespace butteraugli;
'''+heatmap+'''
static cv::Mat compute(const cv::Mat& first,const cv::Mat& second){
 cv::Mat gray1,gray2;cv::cvtColor(first,gray1,cv::COLOR_BGR2GRAY);cv::cvtColor(second,gray2,cv::COLOR_BGR2GRAY);
 auto linear1=CreatePlanes<float>(first.cols,first.rows,3),linear2=CreatePlanes<float>(first.cols,first.rows,3);
 double lut[256];for(int i=0;i<256;i++){double s=i/255.;lut[i]=255*(s<=.04045?s/12.92:std::pow((s+.055)/1.055,2.4));}
 for(int c=0;c<3;c++)for(int y=0;y<first.rows;y++)for(int x=0;x<first.cols;x++){linear1[c].Row(y)[x]=lut[gray1.at<uchar>(y,x)];linear2[c].Row(y)[x]=lut[gray2.at<uchar>(y,x)];}
 ImageF map;double value;
 if(!ButteraugliInterface(linear1,linear2,1.,map,value))throw std::runtime_error("Butteraugli comparison failed");
 char formatted[64];std::snprintf(formatted,sizeof(formatted),"%.6f",value);comparisonScore=std::strtod(formatted,nullptr);
 std::vector<uint8_t> pixels;CreateHeatMapImage(map,ButteraugliFuzzyInverse(1.5),ButteraugliFuzzyInverse(.5),first.cols,first.rows,&pixels);
 return cv::Mat(first.rows,first.cols,CV_8UC3,pixels.data()).clone();
}
}
''')
