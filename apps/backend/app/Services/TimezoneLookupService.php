<?php

namespace App\Services;

use App\Services\TimezoneProviders\GeoNamesProvider;
use App\Services\TimezoneProviders\GoogleTimeZoneProvider;
use App\Services\TimezoneProviders\OfflineTimezoneProvider;
use App\Services\TimezoneProviders\TimeApiProvider;
use App\Services\TimezoneProviders\TimezoneProviderException;
use App\Services\TimezoneProviders\TimezoneProviderInterface;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Resolves an IANA timezone from coordinates by trying multiple independent providers in
 * order and returning the first successful result. No single provider's outage, rate
 * limit, or misconfiguration can block a user from saving a valid attendance location as
 * long as at least one configured provider is healthy.
 *
 * Public contract (resolve(float, float): string, throwing ValidationException on total
 * failure) is unchanged from the single-provider implementation — callers in
 * ApiController require no changes.
 */
class TimezoneLookupService
{
    /** @var TimezoneProviderInterface[] */
    private array $providers;

    public function __construct(?array $providers = null)
    {
        // Fallback order: TimeAPI (free, keyless, always attempted) -> GeoNames (free,
        // requires a registered username) -> Google (paid/billing-enabled key) -> offline
        // (local package, if one is ever installed). Each is only attempted when
        // isConfigured() is true.
        $this->providers = $providers ?? [
            new TimeApiProvider(),
            new GeoNamesProvider(),
            new GoogleTimeZoneProvider(),
            new OfflineTimezoneProvider(),
        ];
    }

    public function resolve(float $latitude, float $longitude): string
    {
        $attempted = [];
        $skipped = [];

        foreach ($this->providers as $provider) {
            if (! $provider->isConfigured()) {
                $skipped[] = $provider->name();
                Log::debug('Timezone provider skipped (not configured).', [
                    'provider' => $provider->name(),
                ]);

                continue;
            }

            $attempted[] = $provider->name();

            try {
                $timezone = $provider->resolve($latitude, $longitude);
            } catch (TimezoneProviderException $exception) {
                // Already logged in detail by the provider itself (AbstractHttpTimezoneProvider::fail()).
                // Nothing more to do here except move on to the next provider in the chain.
                continue;
            }

            $usedFallback = $attempted[0] !== $provider->name();
            Log::info('Timezone lookup resolved.', [
                'provider_used' => $provider->name(),
                'fallback_used' => $usedFallback,
                'providers_attempted' => $attempted,
                'providers_skipped' => $skipped,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'final_timezone' => $timezone,
            ]);

            return $timezone;
        }

        Log::error('Timezone lookup failed: every configured provider was exhausted.', [
            'providers_attempted' => $attempted,
            'providers_skipped' => $skipped,
            'latitude' => $latitude,
            'longitude' => $longitude,
        ]);

        // Deliberately generic and provider-agnostic — the user never sees which
        // third-party service was involved, let alone which one(s) failed.
        throw ValidationException::withMessages([
            'address' => ['We could not automatically determine the timezone for this address. Please double-check the address and try again.'],
        ]);
    }
}
