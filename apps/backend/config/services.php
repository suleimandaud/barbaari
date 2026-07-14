<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'stripe' => [
        'mode' => env('STRIPE_MODE', 'test'),
        'public' => env('STRIPE_PUBLIC_KEY'),
        'secret' => env('STRIPE_SECRET_KEY'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
        'price_id' => env('STRIPE_PRICE_ID'),
    ],

    'billing' => [
        'test_payment_enabled' => env('BILLING_TEST_PAYMENT_ENABLED', false),
    ],

    'usps' => [
        'consumer_key' => env('USPS_CONSUMER_KEY'),
        'consumer_secret' => env('USPS_CONSUMER_SECRET'),
        'base_url' => env('USPS_BASE_URL', 'https://apis.usps.com'),
    ],

    'geocoder' => [
        'provider' => env('GEOCODER_PROVIDER', 'nominatim'),
        'nominatim_base_url' => env('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
    ],

    'timezone_lookup' => [
        // Tried in this order by TimezoneLookupService; each is skipped automatically
        // unless it's configured. Only timeapi_base_url has a default (a free, keyless
        // API) — everything else is opt-in via env var, so a fresh deploy still works
        // with zero extra configuration, and adding redundancy is a one-line env change.
        'timeapi_base_url' => env('TIMEZONE_LOOKUP_BASE_URL', 'https://www.timeapi.io'),
        'geonames_username' => env('GEONAMES_USERNAME'),
        'geonames_base_url' => env('GEONAMES_BASE_URL', 'http://api.geonames.org'),
        'google_api_key' => env('GOOGLE_TIMEZONE_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
