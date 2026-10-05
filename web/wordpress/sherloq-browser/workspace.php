<?php
if (!defined('ABSPATH')) { exit; }
$attributes = $GLOBALS['sherloq_workspace_attributes'] ?? array();
$language = in_array($attributes['language'] ?? 'auto', array('fr', 'en'), true) ? $attributes['language'] : 'auto';
$source = sherloq_browser_asset_url() . '#lang=' . $language . '&home=' . rawurlencode(home_url('/'));
?><!doctype html>
<html lang="<?php echo esc_attr($language === 'auto' ? 'en' : $language); ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SHERLOQ</title><link rel="stylesheet" href="<?php echo esc_url(plugins_url('assets/workspace.css', __FILE__)); ?>"></head><body><iframe title="SHERLOQ" src="<?php echo esc_url($source); ?>" allow="fullscreen"></iframe></body></html>
