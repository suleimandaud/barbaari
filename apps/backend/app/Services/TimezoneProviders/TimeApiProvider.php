<?php

namespace App\Services\TimezoneProviders;

class TimeApiProvider extends AbstractHttpTimezoneProvider
{
    public function name(): string
    {
        return 'timeapi';
    }

    public function isConfigured(): bool
    {
        // Free, keyless API — always attemptable as long as a base URL resolves. An empty
        // base URL (stale config cache is the usual cause) is treated as "not configured"
        // rather than throwing here, so the orchestrator just moves on to the next provider
        // instead of the whole request dying on a config problem.
        return $this->baseUrl() !== '';
    }

    protected function endpoint(): string
    {
        return $this->baseUrl().'/api/timezone/coordinate';
    }

    protected function query(float $latitude, float $longitude): array
    {
        return ['latitude' => $latitude, 'longitude' => $longitude];
    }

    protected function extractTimezone(array $decoded): ?string
    {
        $timezone = $decoded['timeZone'] ?? null;

        return is_string($timezone) ? $timezone : null;
    }

    private function baseUrl(): string
    {
        return rtrim((string) config('services.timezone_lookup.timeapi_base_url'), '/');
    }
}
