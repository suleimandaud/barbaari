<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline security headers for every response. This is a JSON API consumed by separate
 * SPA/mobile clients, not a page-rendering app, so Content-Security-Policy is deliberately
 * not set here — a CSP is meaningful per-document and belongs with each frontend's own
 * hosting/CDN config, not on JSON API responses. These headers are the ones that are
 * unconditionally safe and correct for any HTTP response regardless of content type.
 */
class AddSecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

        // Only ever sent over an already-HTTPS connection ($request->secure()), so this can
        // never downgrade a plain-HTTP local dev request — defense-in-depth in case the
        // reverse proxy/CDN in front of production doesn't already set this itself.
        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
