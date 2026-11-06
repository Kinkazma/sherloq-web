#include <algorithm>
#include <cmath>
#include <cstdint>

// The existing Ghost peer statistic, batched beside the unchanged cKDTree.
// Binary64 operations and median sorting retain the JavaScript reference order.
// No approximate quantiles, changed peers or reduced quality range are used.
static double median(double* values, int count) {
    std::sort(values, values + count);
    const int middle = count / 2;
    return count % 2 ? values[middle]
                     : (values[middle - 1] + values[middle]) * .5;
}

extern "C" int ela_ghost_profiles_batch(
    const double* profiles, const int32_t* source_ids,
    const uint8_t* supported, const int32_t* neighbors,
    const double* distances, int rows, int cols, int start, int count, int k,
    float* scores, int16_t* qualities, int32_t* peer_counts, uint8_t* valid) {
    if (!profiles || !source_ids || !supported || !neighbors || !distances ||
        !scores || !qualities || !peer_counts || !valid || rows < 1 || cols < 1 ||
        start < 0 || count < 1 || start + count > rows * cols || k < 1 || k > 128)
        return 0;
    const int spatial = std::max(2, std::min(rows, cols) / 5);
    for (int row = 0; row < count; ++row) {
        const int index = start + row;
        int peers[64], peer_count = 0;
        for (int j = 0; j < k && peer_count < 64; ++j) {
            const int other = source_ids[neighbors[row * k + j]];
            if (distances[row * k + j] <= .5 &&
                std::max(std::abs(other / cols - index / cols),
                         std::abs(other % cols - index % cols)) > spatial)
                peers[peer_count++] = other;
        }
        if (!supported[index] || peer_count < 16) continue;
        peer_counts[index] = peer_count;
        valid[index] = 1;
        double z[71];
        for (int q = 0; q < 71; ++q) {
            double values[64];
            for (int p = 0; p < peer_count; ++p)
                values[p] = profiles[peers[p] * 71 + q];
            const double reference = median(values, peer_count);
            for (int p = 0; p < peer_count; ++p)
                values[p] = std::abs(values[p] - reference);
            const double mad = median(values, peer_count);
            z[q] = std::max(0., (reference - profiles[index * 71 + q]) /
                                    std::max(1.4826 * mad, .10));
        }
        double best = 0.;
        int quality = 0;
        for (int q = 1; q < 70; ++q) {
            double three[3] = {z[q - 1], z[q], z[q + 1]};
            const double value = median(three, 3);
            if (value > best) { best = value; quality = q; }
        }
        scores[index] = best;
        qualities[index] = quality + 30;
    }
    return 1;
}
