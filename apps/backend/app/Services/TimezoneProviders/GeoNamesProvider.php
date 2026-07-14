<?php

namespace App\Services\TimezoneProviders;

/**
 * https://www.geonames.org/export/web-services.html#timezone
 * Free tier requires a registered (free) username — the shared "demo" username is
 * explicitly documented by GeoNames as unusable for real applications (very low, shared
 * daily quota) and returns a clear {"status":{"message": "...daily limit...exceeded..."}}
 * error, verified live. We deliberately do not fall back to "demo" — if no real username
 * is configured, this provider reports itself as unconfigured and is skipped cleanly.
 */
class GeoNamesProvider extends AbstractHttpTimezoneProvider
{
    public function name(): string
    {
        return 'geonames';
    }

    public function isConfigured(): bool
    {
        return $this->username() !== '';
    }

    protected function endpoint(): string
    {
        return rtrim((string) config('services.timezone_lookup.geonames_base_url', 'http://api.geonames.org'), '/').'/timezoneJSON';
    }

    protected function query(float $latitude, float $longitude): array
    {
        return ['lat' => $latitude, 'lng' => $longitude, 'username' => $this->username()];
    }

    protected function secretQueryKeys(): array
    {
        return ['username'];
    }

    protected function extractTimezone(array $decoded): ?string
    {
        // GeoNames returns HTTP 200 even for quota/auth errors, embedding the failure in a
        // "status" object instead of an HTTP status code — treat its presence as failure.
        if (isset($decoded['status'])) {
            return null;
        }

        $timezone = $decoded['timezoneId'] ?? null;

        return is_string($timezone) ? $timezone : null;
    }

    private function username(): string
    {
        return trim((string) config('services.timezone_lookup.geonames_username'));
    }
}
