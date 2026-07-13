<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class TimezoneLookupService
{
    public function resolve(float $latitude, float $longitude): string
    {
        $provider = strtolower((string) config('services.timezone_lookup.provider', 'timeapi'));

        return match ($provider) {
            'timeapi' => $this->resolveWithTimeApi($latitude, $longitude),
            default => throw $this->lookupFailed(),
        };
    }

    private function resolveWithTimeApi(float $latitude, float $longitude): string
    {
        $baseUrl = rtrim((string) config('services.timezone_lookup.timeapi_base_url'), '/');

        try {
            $response = Http::acceptJson()
                ->timeout(10)
                ->get($baseUrl.'/api/timezone/coordinate', [
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                ]);
        } catch (\Throwable $exception) {
            Log::warning('Timezone lookup request failed.', [
                'provider' => 'timeapi',
                'error' => $exception->getMessage(),
            ]);
            throw $this->lookupFailed();
        }

        if (! $response->successful()) {
            Log::info('Timezone lookup did not return a timezone.', [
                'provider' => 'timeapi',
                'status' => $response->status(),
            ]);
            throw $this->lookupFailed();
        }

        $timezone = $response->json('timeZone');
        if (! is_string($timezone) || ! in_array($timezone, timezone_identifiers_list(), true)) {
            Log::warning('Timezone lookup returned an invalid timezone.', [
                'provider' => 'timeapi',
                'timezone' => $timezone,
            ]);
            throw $this->lookupFailed();
        }

        return $timezone;
    }

    private function lookupFailed(): ValidationException
    {
        return ValidationException::withMessages([
            'address' => ['We could not automatically determine the timezone for this address. Please double-check the address and try again.'],
        ]);
    }
}
