<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands([
        __DIR__.'/../app/Console/Commands',
    ])
    ->withMiddleware(function (Middleware $middleware): void {
        // Unset (default): trust nothing, identical to Laravel's out-of-the-box behavior.
        // In production, this app almost always sits behind a load balancer / reverse
        // proxy that terminates TLS, so without this, $request->secure() is always false
        // (breaking the HSTS header and secure-cookie enforcement) and $request->ip() is
        // always the proxy's IP (breaking the IP-keyed rate limiters on unauthenticated
        // routes). Set TRUSTED_PROXIES to the load balancer's IP/CIDR, or "*" only if the
        // proxy itself is trusted infrastructure you control end-to-end.
        $trustedProxies = trim((string) env('TRUSTED_PROXIES', ''));
        $middleware->trustProxies(
            at: match (true) {
                $trustedProxies === '' => null,
                $trustedProxies === '*' => '*',
                default => array_map('trim', explode(',', $trustedProxies)),
            },
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO,
        );
        $middleware->prepend(\App\Http\Middleware\AssignRequestId::class);
        $middleware->append(\Illuminate\Http\Middleware\HandleCors::class);
        $middleware->append(\App\Http\Middleware\AddSecurityHeaders::class);
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureRole::class,
            'subscription.active' => \App\Http\Middleware\EnsureActiveSubscription::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Defense-in-depth: guarantee a generic, safe JSON error for any unexpected
        // exception (raw DB errors, uncaught TypeErrors, etc.), independent of APP_DEBUG.
        // This must never intercept the exceptions Laravel already renders correctly:
        // ValidationException/AuthenticationException are handled by Laravel's own render()
        // match block, and HttpExceptionInterface covers every abort()/abort_if() call in
        // this codebase plus ModelNotFoundException and AuthorizationException, both of
        // which Laravel's Handler::prepareException() already converts to an
        // HttpException/NotFoundHttpException *before* this callback runs.
        // HttpResponseException is a fourth "already a real response" case: every named
        // rate limiter in AppServiceProvider (auth, invitations, api, pin) sets a custom
        // ->response() on its Limit, and Laravel's ThrottleRequests middleware throws this
        // exact exception type to carry that response through the pipeline. Excluding it
        // here means a throttled request still gets its intended 429 + friendly message;
        // without this it was getting swallowed into the generic 500 below instead.
        $exceptions->render(function (\Throwable $e, \Illuminate\Http\Request $request) {
            if (! $request->expectsJson()) {
                return null;
            }
            if ($e instanceof \Illuminate\Validation\ValidationException
                || $e instanceof \Illuminate\Auth\AuthenticationException
                || $e instanceof \Illuminate\Http\Exceptions\HttpResponseException
                || $e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                return null;
            }

            \Illuminate\Support\Facades\Log::error('Unhandled exception reached the top-level handler.', [
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            return response()->json(['message' => 'Something went wrong. Please try again.'], 500);
        });
    })->create();
