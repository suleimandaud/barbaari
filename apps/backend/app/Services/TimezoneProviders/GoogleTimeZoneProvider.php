<?php

namespace App\Services\TimezoneProviders;

/**
 * https://developers.google.com/maps/documentation/timezone/requests-timezone
 * Requires a billing-enabled Google Maps Platform API key. Optional — if no key is
 * configured this provider is skipped, no request is ever made. Verified live (without a
 * key) that Google returns HTTP 200 with {"status":"REQUEST_DENIED","errorMessage":"..."}
 * rather than a non-2xx status, which is why "status" must be checked explicitly rather
 * than trusting a 200 response code.
 */
class GoogleTimeZoneProvider extends AbstractHttpTimezoneProvider
{
    public function name(): string
    {
        return 'google';
    }

    public function isConfigured(): bool
    {
        return $this->apiKey() !== '';
    }

    protected function endpoint(): string
    {
        return 'https://maps.googleapis.com/maps/api/timezone/json';
    }

    protected function query(float $latitude, float $longitude): array
    {
        return [
            'location' => $latitude.','.$longitude,
            'timestamp' => now()->timestamp,
            'key' => $this->apiKey(),
        ];
    }

    protected function secretQueryKeys(): array
    {
        return ['key'];
    }

    protected function extractTimezone(array $decoded): ?string
    {
        if (($decoded['status'] ?? null) !== 'OK') {
            return null;
        }

        $timezone = $decoded['timeZoneId'] ?? null;

        return is_string($timezone) ? $timezone : null;
    }

    private function apiKey(): string
    {
        return trim((string) config('services.timezone_lookup.google_api_key'));
    }
}
