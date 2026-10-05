<?php
/**
 * Plugin Name: SHERLOQ Browser Lab
 * Description: Local browser image analysis, with an isolated bilingual workspace.
 * Version: 0.14.2
 * Requires at least: 6.3
 * Requires PHP: 7.4
 * License: GPL-3.0-or-later
 * Text Domain: sherloq-browser
 */
if (!defined('ABSPATH')) { exit; }
/** Pass the active site's Adobe configuration into both isolated app previews. */
function sherloq_browser_asset_url() {
    $url = plugins_url('assets/app.php', __FILE__);
    $fonts = defined('GAELDAUCHY_V4_ADOBE_FONTS_URL') ? GAELDAUCHY_V4_ADOBE_FONTS_URL : '';
    $fonts = apply_filters('sherloq_browser_adobe_fonts_url', $fonts);
    $args = array('v' => '0.14.2');
    if (is_string($fonts) && preg_match('~^https://use\.typekit\.net/[a-z0-9]+\.css$~D', $fonts)) { $args['fonts'] = $fonts; }
    return add_query_arg($args, $url);
}
function sherloq_browser_render($attributes = array()) {
    $language = in_array($attributes['language'] ?? 'auto', array('fr', 'en'), true) ? $attributes['language'] : 'auto';
    $height = max(560, min(1600, absint($attributes['height'] ?? 920)));
    $url = sherloq_browser_asset_url() . '#lang=' . $language . '&home=' . rawurlencode(home_url('/')); 
    return '<iframe class="sherloq-browser-frame" title="SHERLOQ Browser Lab" src="' . esc_url($url) . '" style="display:block;width:100%;height:' . esc_attr($height) . 'px;border:0;border-radius:12px" loading="lazy" allow="fullscreen"></iframe>';
}
add_action('init', function () {
    wp_register_script('sherloq-browser-editor', plugins_url('assets/editor.js', __FILE__), array('wp-blocks','wp-element','wp-block-editor','wp-components'), '0.14.2', true);
    wp_add_inline_script('sherloq-browser-editor', 'window.sherloqBrowserAssetURL=' . wp_json_encode(sherloq_browser_asset_url()) . ';', 'before');
    register_block_type('sherloq/browser', array(
        'api_version' => 3,
        'editor_script' => 'sherloq-browser-editor',
        'attributes' => array('language'=>array('type'=>'string','default'=>'auto'), 'height'=>array('type'=>'number','default'=>920)),
        'render_callback' => 'sherloq_browser_render',
    ));
    add_shortcode('sherloq_browser', function ($attributes) {
        return sherloq_browser_render(shortcode_atts(array('language'=>'auto','height'=>920), $attributes, 'sherloq_browser'));
    });
});

/** Dedicated workspace page: WordPress still handles permissions and previews. */
function sherloq_browser_find_attributes($blocks) {
    foreach ($blocks as $block) {
        if ($block['blockName'] === 'sherloq/browser') { return $block['attrs']; }
        if (!empty($block['innerBlocks'])) {
            $found = sherloq_browser_find_attributes($block['innerBlocks']);
            if ($found !== null) { return $found; }
        }
    }
    return null;
}
add_filter('template_include', function ($template) {
    if (!is_singular() || is_feed() || is_embed()) { return $template; }
    $post = get_queried_object();
    if (!$post instanceof WP_Post || post_password_required($post)) { return $template; }
    $attrs = sherloq_browser_find_attributes(parse_blocks($post->post_content));
    if ($attrs === null && has_shortcode($post->post_content, 'sherloq_browser')) {
        $attrs = array('language'=>'auto');
        if (preg_match('/\[sherloq_browser\s+([^\]]*)\]/', $post->post_content, $match)) {
            $parsed = shortcode_parse_atts($match[1]);
            if (is_array($parsed)) { $attrs = $parsed; }
        }
    }
    if ($attrs === null) { return $template; }
    // Only the dedicated application page opts into shared-memory isolation.
    // Gutenberg and other site pages keep their existing document policy.
    if (!headers_sent()) {
        header('Cross-Origin-Opener-Policy: same-origin');
        header('Cross-Origin-Embedder-Policy: require-corp');
        header('Cross-Origin-Resource-Policy: same-origin');
    }
    $GLOBALS['sherloq_workspace_attributes'] = $attrs;
    return __DIR__ . '/workspace.php';
}, 99);
