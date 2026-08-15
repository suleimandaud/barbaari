<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->configureRateLimiting();
    }

    private function configureRateLimiting(): void
    {
        // Auth endpoints: 10 requests per minute per IP
        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip())->response(function () {
                return response()->json(['message' => 'Too many login attempts. Please try again in a minute.'], 429);
            });
        });

        // Invite endpoints: 5 per minute per IP
        RateLimiter::for('invitations', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip())->response(function () {
                return response()->json(['message' => 'Too many invitation requests. Please try again in a minute.'], 429);
            });
        });

        // Stripe webhook: 60 per minute (Stripe can send bursts)
        RateLimiter::for('stripe-webhook', function (Request $request) {
            return Limit::perMinute(60)->by('stripe-webhook');
        });

        // General API: 120 per minute per user or IP
        RateLimiter::for('api', function (Request $request) {
            $limit = $request->user()
                ? Limit::perMinute(120)->by($request->user()->id)
                : Limit::perMinute(30)->by($request->ip());

            return $limit->response(function () {
                return response()->json(['message' => 'Too many requests. Please wait a moment and try again.'], 429);
            });
        });

        // PIN verification (tablet signer PINs, staff PIN checks): a 4-digit PIN is only
        // 10,000 combinations, so this must be far tighter than the general API limit —
        // 10/min keeps legitimate retries (typos) usable while making brute-force
        // infeasible. Keyed by device/user, not IP, since a shared tablet's IP shouldn't
        // let one signer's failed attempts throttle a different signer on the same device.
        RateLimiter::for('pin', function (Request $request) {
            return Limit::perMinute(10)->by($request->user()?->id ?: $request->ip())->response(function () {
                return response()->json(['message' => 'Too many PIN attempts. Please wait a minute and try again.'], 429);
            });
        });
    }
}
