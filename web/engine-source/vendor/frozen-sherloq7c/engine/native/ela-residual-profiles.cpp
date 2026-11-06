#include <algorithm>
#include <cmath>
#include <cstdint>

static double median(double* values, int count, bool float32) {
    std::sort(values, values + count);
    const int middle = count / 2;
    if (count % 2) return values[middle];
    if (float32) {
        const float sum = float(values[middle - 1] + values[middle]);
        return float(double(sum) * .5);
    }
    return (values[middle - 1] + values[middle]) * .5;
}

// Existing ELA legacy/background operators. Explicit casts are the original
// Math.fround sites; signed scores remain binary64 until their native stores.
extern "C" int ela_residual_profiles_batch(
    const float* profiles, const int32_t* source_ids,
    const uint8_t* supported, const int32_t* neighbors,
    const double* distances, int rows, int cols, int start, int count, int k,
    int background, const double* floors, float* quality_scores,
    float* signed_scores, float* reference_values, float* combined_score,
    int32_t* peer_counts, uint8_t* valid) {
    if (!profiles || !source_ids || !supported || !neighbors || !distances ||
        !quality_scores || !signed_scores || !peer_counts || rows < 1 || cols < 1 ||
        start < 0 || count < 1 || start + count > rows * cols || k < 1 || k > 128 ||
        (background ? (!reference_values || !combined_score || !valid) : !floors))
        return 0;
    const int descriptors = background ? 3 : 5, stride = 3 * descriptors;
    const int spatial = std::max(2, std::min(rows, cols) / 5);
    const double limit = background ? .4 : 1.25;
    for (int row = 0; row < count; ++row) {
        const int index = start + row;
        int peers[64], peer_count = 0;
        for (int j = 0; j < k && peer_count < 64; ++j) {
            const int other = source_ids[neighbors[row * k + j]];
            if (distances[row * k + j] <= limit &&
                std::max(std::abs(other / cols - index / cols),
                         std::abs(other % cols - index % cols)) > spatial)
                peers[peer_count++] = other;
        }
        if (!background) peer_counts[index] = supported[index] ? peer_count : 0;
        if (!supported[index] || peer_count < 16) continue;
        if (background) { peer_counts[index] = peer_count; valid[index] = 1; }
        double z[15];
        for (int at = 0; at < stride; ++at) {
            double values[64];
            for (int p = 0; p < peer_count; ++p)
                values[p] = profiles[peers[p] * stride + at];
            const double reference = median(values, peer_count, true);
            for (int p = 0; p < peer_count; ++p)
                values[p] = std::abs(float(values[p] - reference));
            const double mad = median(values, peer_count, true);
            const double scaled_mad = float(double(float(1.4826)) * mad);
            const double own = profiles[index * stride + at];
            if (background) {
                z[at] = float(double(float(reference - own)) /
                              std::max(scaled_mad, double(float(.1))));
                reference_values[index * stride + at] = reference;
            } else {
                z[at] = double(float(own - reference)) /
                        std::max(scaled_mad, floors[at]);
            }
            signed_scores[index * stride + at] = z[at];
        }
        double qs[3];
        for (int q = 0; q < 3; ++q) {
            if (background) {
                double three[3] = {z[q * 3], z[q * 3 + 1], z[q * 3 + 2]};
                qs[q] = median(three, 3, true);
                quality_scores[index * 3 + q] = qs[q];
            } else {
                double five[5];
                for (int d = 0; d < 5; ++d) five[d] = std::abs(z[q * 5 + d]);
                std::sort(five, five + 5);
                quality_scores[index * 3 + q] =
                    std::sqrt((five[3] * five[3] + five[4] * five[4]) / 2.);
            }
        }
        if (background) combined_score[index] = std::max(0., median(qs, 3, true));
    }
    return 1;
}
