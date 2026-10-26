// Additive presence guards only. The original histogram/confidence/prior,
// pixel checkSplit predicates, ordering and nr_partitions updates stay native.
void SuperpixelSEEDSSupportImpl::setSupport(const uint32_t* indices, int count)
{
    const int64_t area64 = static_cast<int64_t>(width) * height;
    CV_Assert(area64 > 0 && area64 <= INT_MAX && count >= 0 && count <= area64 && (count == 0 || indices));
    const int area = static_cast<int>(area64);
    support_present.assign(area, 0);
    if (count) support_indices.assign(indices, indices + count);
    else support_indices.clear();
    support_visited.assign(area, 0);
    support_queue.resize(area);
    for (int k = 0; k < count; k++) {
        CV_Assert(indices[k] < static_cast<uint32_t>(area) && (k == 0 || indices[k] > indices[k - 1]));
        support_present[indices[k]] = 1;
    }
    support_all = count == area;
}

void SuperpixelSEEDSSupportImpl::supportNextEpoch()
{
    if (++support_epoch == 0) {
        std::fill(support_visited.begin(), support_visited.end(), 0);
        support_epoch = 1;
    }
}

int SuperpixelSEEDSSupportImpl::supportTopLabel(int level, int x, int y)
{
    return parent[level][computeLabel(level, x, y)];
}

bool SuperpixelSEEDSSupportImpl::supportBlockMove(int level, int sublabel, int from, int to)
{
    support_metrics[1]++;
    if (support_all) { support_metrics[7]++; return true; }
    // These are real histogram masses, distinct from the untouched native
    // heuristic nr_partitions. No division into absent/empty mass is evaluated.
    if (T[level][sublabel] <= 0 || T[seeds_top_level][to] <= 0 ||
            T[seeds_top_level][from] - T[level][sublabel] <= 0) {
        support_metrics[2]++; return false;
    }
    const int nw = nr_wh[2 * level], nh = nr_wh[2 * level + 1];
    const int bx = sublabel % nw, by = sublabel / nw;
    const auto edge = [](int cell, int pixels, int cells) { return static_cast<int>((static_cast<int64_t>(cell) * pixels + cells - 1) / cells); };
    const int x0 = edge(bx, width, nw), x1 = edge(bx + 1, width, nw);
    const int y0 = edge(by, height, nh), y1 = edge(by + 1, height, nh);
    const auto inside = [=](int x, int y) { return x >= x0 && x < x1 && y >= y0 && y < y1; };
    const int dx[4] = {-1, 1, 0, 0}, dy[4] = {0, 0, -1, 1};

    // Every actual moved component must meet the destination label across a
    // true four-neighbor edge. Positive masses or adjacent block slots alone
    // are not evidence of such a contact.
    supportNextEpoch();
    for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) {
        const int first = y * width + x;
        if (!support_present[first] || support_visited[first] == support_epoch) continue;
        int head = 0, tail = 0; bool contactsDestination = false;
        support_queue[tail++] = first; support_visited[first] = support_epoch;
        while (head < tail) {
            const int at = support_queue[head++], px = at % width, py = at / width;
            for (int d = 0; d < 4; d++) {
                const int qx = px + dx[d], qy = py + dy[d];
                if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
                const int q = qy * width + qx;
                if (!support_present[q]) continue;
                if (!inside(qx, qy)) {
                    if (supportTopLabel(level, qx, qy) == to) contactsDestination = true;
                } else if (support_visited[q] != support_epoch) {
                    support_visited[q] = support_epoch; support_queue[tail++] = q;
                }
            }
        }
        if (!contactsDestination) { support_metrics[4]++; return false; }
    }

    // The native block split predicate is still required by the caller. This
    // extra local support test prevents a hole inside a block from fabricating
    // the paths that predicate assumes in its regular block neighborhood.
    const int rx0 = edge(std::max(0, bx - 1), width, nw), rx1 = edge(std::min(nw, bx + 2), width, nw);
    const int ry0 = edge(std::max(0, by - 1), height, nh), ry1 = edge(std::min(nh, by + 2), height, nh);
    const auto scanContacts = [&](const auto& visit) {
        for (int yy = y0; yy < y1; yy++) {
            if (x0 > 0 && support_present[yy * width + x0 - 1] && supportTopLabel(level, x0 - 1, yy) == from) visit(yy * width + x0 - 1);
            if (x1 < width && support_present[yy * width + x1] && supportTopLabel(level, x1, yy) == from) visit(yy * width + x1);
        }
        for (int xx = x0; xx < x1; xx++) {
            if (y0 > 0 && support_present[(y0 - 1) * width + xx] && supportTopLabel(level, xx, y0 - 1) == from) visit((y0 - 1) * width + xx);
            if (y1 < height && support_present[y1 * width + xx] && supportTopLabel(level, xx, y1) == from) visit(y1 * width + xx);
        }
    };
    int firstContact = -1;
    scanContacts([&](int at) { if (firstContact < 0) firstContact = at; });
    if (firstContact >= 0) {
        supportNextEpoch(); int head = 0, tail = 0;
        support_queue[tail++] = firstContact; support_visited[firstContact] = support_epoch;
        while (head < tail) {
            const int at = support_queue[head++], px = at % width, py = at / width;
            for (int d = 0; d < 4; d++) {
                const int qx = px + dx[d], qy = py + dy[d];
                if (qx < rx0 || qx >= rx1 || qy < ry0 || qy >= ry1 || inside(qx, qy)) continue;
                const int q = qy * width + qx;
                if (!support_present[q] || support_visited[q] == support_epoch || supportTopLabel(level, qx, qy) != from) continue;
                support_visited[q] = support_epoch; support_queue[tail++] = q;
            }
        }
        bool remainingContactsConnected = true;
        scanContacts([&](int at) { if (support_visited[at] != support_epoch) remainingContactsConnected = false; });
        if (!remainingContactsConnected) { support_metrics[5]++; return false; }
    }
    support_metrics[6]++; return true;
}
