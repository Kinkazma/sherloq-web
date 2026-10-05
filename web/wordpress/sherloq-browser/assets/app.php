<?php
// Serve only the fixed application document. Static-file headers are not
// guaranteed on Nginx/CDNs, even when WordPress itself runs under Apache.
header('Content-Type: text/html; charset=UTF-8');
header('Cross-Origin-Opener-Policy: same-origin');
header('Cross-Origin-Embedder-Policy: require-corp');
header('Cross-Origin-Resource-Policy: same-origin');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
readfile(__DIR__ . '/app.html');
