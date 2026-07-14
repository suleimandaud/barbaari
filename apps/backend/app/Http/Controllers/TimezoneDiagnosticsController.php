<?php

namespace App\Http\Controllers;

use App\Services\GeocodingService;
use App\Services\TimezoneLookupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * TEMPORARY diagnostics endpoint for the production timezone-detection outage.
 *
 * Purpose: prove, from inside the actual production process, whether the failure is a
 * stale deployment, a stale config/opcache, a networking restriction, or a genuine code
 * defect — without requiring SSH access. Every value a human would otherwise have to SSH
 * in and grep logs for is returned directly in the JSON response.
 *
 * Access is gated by the TIMEZONE_DEBUG_TOKEN env var so this cannot be hit by anyone who
 * doesn't have it. If that env var is unset, every request 404s (fails closed) — so
 * forgetting to set it is safe, but you must still delete this file and its route once the
 * incident is resolved. See the "Remove this" note at the bottom of this class.
 */
class TimezoneDiagnosticsController extends Controller
{
    public function check(Request $request, GeocodingService $geocoder, TimezoneLookupService $timezoneLookup)
    {
        $expectedToken = env('TIMEZONE_DEBUG_TOKEN');
        if (! $expectedToken || ! hash_equals($expectedToken, (string) $request->header('X-Debug-Token', ''))) {
            abort(404);
        }

        $latitude = (float) $request->query('latitude', 47.6062);
        $longitude = (float) $request->query('longitude', -122.3321);

        // On shared/cPanel hosting an operator often has no systemctl/root access to
        // restart PHP-FPM, so an in-process opcache_reset() (which runs inside the same
        // SAPI/worker pool actually serving requests) may be the only real way to bust a
        // stale OPcache. ?reset_opcache=1 does this and reports whether it actually ran.
        $opcacheReset = null;
        if ($request->boolean('reset_opcache')) {
            $opcacheReset = function_exists('opcache_reset') ? opcache_reset() : 'opcache_reset() function does not exist on this host';
        }

        $report = [
            'opcache_reset_requested' => $opcacheReset,
            'deployment' => $this->deploymentInfo(),
            'config' => $this->configInfo(),
            'connectivity' => $this->connectivityInfo(),
            'geocoding' => null,
            'timezone_lookup' => null,
            'final_api_response' => null,
        ];

        // Direct, unwrapped HTTP call to TimeAPI (bypassing TimezoneLookupService's
        // exception handling) so the raw status/body are visible here even on failure,
        // exactly matching what TimezoneLookupService itself sends.
        $baseUrl = rtrim((string) config('services.timezone_lookup.timeapi_base_url'), '/');
        $endpoint = $baseUrl.'/api/timezone/coordinate';
        $requestUrl = $endpoint.'?'.http_build_query(['latitude' => $latitude, 'longitude' => $longitude]);
        $started = microtime(true);

        try {
            $response = Http::acceptJson()->timeout(10)->get($endpoint, [
                'latitude' => $latitude,
                'longitude' => $longitude,
            ]);
            $report['timezone_lookup'] = [
                'request_url' => $requestUrl,
                'http_status' => $response->status(),
                'raw_response_body' => $response->body(),
                'decoded_json' => $response->json(),
                'duration_ms' => round((microtime(true) - $started) * 1000),
            ];
        } catch (\Throwable $exception) {
            $report['timezone_lookup'] = [
                'request_url' => $requestUrl,
                'exception_class' => $exception::class,
                'exception_message' => $exception->getMessage(),
                'duration_ms' => round((microtime(true) - $started) * 1000),
            ];
        }

        // Now run the actual production code paths (GeocodingService + TimezoneLookupService)
        // exactly as the real request would, to confirm the raw call above matches what the
        // deployed service classes actually produce end-to-end.
        try {
            $address = [
                'address_line1' => (string) $request->query('address_line1', '400 Broad St'),
                'city' => (string) $request->query('city', 'Seattle'),
                'state' => (string) $request->query('state', 'WA'),
                'postal_code' => (string) $request->query('postal_code', '98109'),
                'country' => 'US',
            ];
            $address['standardized_address'] = implode(', ', [$address['address_line1'], $address['city'].', '.$address['state'].' '.$address['postal_code']]);

            $coordinates = $geocoder->geocode($address);
            $report['geocoding'] = ['status' => 'ok', 'coordinates' => $coordinates];

            $timezone = $timezoneLookup->resolve((float) $coordinates['latitude'], (float) $coordinates['longitude']);
            $report['final_api_response'] = ['status' => 'ok', 'timezone' => $timezone];
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $report['geocoding'] = $report['geocoding'] ?? ['status' => 'not_reached'];
            $report['final_api_response'] = [
                'status' => 'failed',
                'errors' => $exception->errors(),
            ];
        } catch (\Throwable $exception) {
            $report['final_api_response'] = [
                'status' => 'unexpected_exception',
                'exception_class' => $exception::class,
                'exception_message' => $exception->getMessage(),
            ];
        }

        Log::warning('TIMEZONE_DEBUG diagnostic endpoint invoked.', $report);

        return response()->json($report);
    }

    private function deploymentInfo(): array
    {
        $gitCommit = null;
        $gitStatus = null;
        try {
            if (function_exists('shell_exec')) {
                $head = @shell_exec('cd '.escapeshellarg(base_path()).' && git rev-parse HEAD 2>&1');
                $gitCommit = $head ? trim($head) : 'shell_exec returned nothing (git binary or exec may be disabled on this host)';
                $status = @shell_exec('cd '.escapeshellarg(base_path()).' && git status --short 2>&1');
                $gitStatus = $status !== null ? trim($status) : null;
            } else {
                $gitCommit = 'shell_exec is disabled on this host — cannot read git commit this way';
            }
        } catch (\Throwable $exception) {
            $gitCommit = 'error reading git commit: '.$exception->getMessage();
        }

        return [
            'git_commit' => $gitCommit,
            'git_status_short' => $gitStatus ?: '(clean or unavailable)',
            'php_version' => PHP_VERSION,
            'server_time' => now()->toIso8601String(),
            'opcache_enabled' => function_exists('opcache_get_status') && opcache_get_status(false) !== false,
        ];
    }

    private function configInfo(): array
    {
        $configCachePath = base_path('bootstrap/cache/config.php');
        $configSourcePath = config_path('services.php');
        $configCacheExists = file_exists($configCachePath);

        return [
            'config_is_cached' => $configCacheExists,
            'config_cache_mtime' => $configCacheExists ? date('c', filemtime($configCachePath)) : null,
            'services_php_mtime' => file_exists($configSourcePath) ? date('c', filemtime($configSourcePath)) : null,
            // If config_is_cached is true and config_cache_mtime is OLDER than
            // services_php_mtime, the running process is serving a stale config snapshot
            // from before this env var / config block existed — run `php artisan config:cache`.
            'timezone_lookup_base_url' => config('services.timezone_lookup.timeapi_base_url'),
            'geonames_username_configured' => config('services.timezone_lookup.geonames_username') !== null,
            'google_api_key_configured' => config('services.timezone_lookup.google_api_key') !== null,
            'geocoder_provider' => config('services.geocoder.provider'),
            'nominatim_base_url' => config('services.geocoder.nominatim_base_url'),
        ];
    }

    private function connectivityInfo(): array
    {
        $targets = [
            'timeapi.io' => 'https://www.timeapi.io/api/timezone/coordinate?latitude=0&longitude=0',
            'nominatim.openstreetmap.org' => 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=test',
        ];

        $results = [];
        foreach ($targets as $name => $url) {
            $started = microtime(true);
            try {
                $response = Http::timeout(8)->get($url);
                $results[$name] = [
                    'reachable' => true,
                    'http_status' => $response->status(),
                    'duration_ms' => round((microtime(true) - $started) * 1000),
                ];
            } catch (\Throwable $exception) {
                $results[$name] = [
                    'reachable' => false,
                    'exception_class' => $exception::class,
                    'exception_message' => $exception->getMessage(),
                    'duration_ms' => round((microtime(true) - $started) * 1000),
                ];
            }
        }

        return $results;
    }

    // --- Remove this: delete this file and its route in routes/api.php once the incident
    // in TIMEZONE_PRODUCTION_DEBUG_REPORT.md is resolved. This endpoint executes real
    // outbound requests and echoes internal config/deployment state — it must not remain
    // reachable in production long-term even though it's token-gated. ---
}
