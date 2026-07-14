<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        'https://barbaari.pioneeriya.com',
        'https://admin-barbaari.pioneeriya.com',
        'https://tablet-barbaari.pioneeriya.com',
        'http://127.0.0.1:5173',
        'http://localhost:5173',
        'http://127.0.0.1:5174',
        'http://localhost:5174',
        'http://127.0.0.1:8081',
        'http://localhost:8081',
    ],
    // Any-port localhost/127.0.0.1 is only for local development convenience (Vite's
    // dev-server port varies) — never allow it in production, where the explicit
    // allowed_origins list above is the only thing that should match.
    'allowed_origins_patterns' => env('APP_ENV') === 'production'
        ? []
        : ['#^https?://(localhost|127\.0\.0\.1):[0-9]+$#'],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
