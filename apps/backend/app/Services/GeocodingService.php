<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GeocodingService
{
    public function geocode(array $address): array
    {
        $provider = strtolower((string) config('services.geocoder.provider', 'nominatim'));

        return match ($provider) {
            'nominatim' => $this->geocodeWithNominatim($address),
            default => throw ValidationException::withMessages([
                'address' => ['Address was validated, but we could not find map coordinates. Please try a more specific address.'],
            ]),
        };
    }

    private function geocodeWithNominatim(array $address): array
    {
        $baseUrl = rtrim((string) config('services.geocoder.nominatim_base_url'), '/');
        $query = $address['standardized_address'] ?? implode(', ', array_filter([
            $address['address_line1'] ?? null,
            $address['address_line2'] ?? null,
            $address['city'] ?? null,
            $address['state'] ?? null,
            $address['postal_code'] ?? null,
            $address['country'] ?? 'US',
        ]));

        try {
            $response = Http::withHeaders([
                'User-Agent' => config('app.name', 'Barbaari').'/address-validation '.config('app.url'),
            ])
                ->acceptJson()
                ->timeout(12)
                ->get($baseUrl.'/search', [
                    'format' => 'jsonv2',
                    'limit' => 1,
                    'countrycodes' => 'us',
                    'q' => $query,
                ]);
        } catch (\Throwable $exception) {
            Log::warning('Geocoding request failed.', [
                'provider' => 'nominatim',
                'error' => $exception->getMessage(),
            ]);
            throw $this->geocodingFailed();
        }

        if (! $response->successful() || empty($response->json())) {
            Log::info('Geocoding did not return coordinates.', ['provider' => 'nominatim', 'status' => $response->status()]);
            throw $this->geocodingFailed();
        }

        $result = $response->json()[0] ?? null;
        if (! isset($result['lat'], $result['lon'])) {
            throw $this->geocodingFailed();
        }

        return [
            'latitude' => round((float) $result['lat'], 7),
            'longitude' => round((float) $result['lon'], 7),
            'geocoding_provider' => 'nominatim',
        ];
    }

    private function geocodingFailed(): ValidationException
    {
        return ValidationException::withMessages([
            'address' => ['Address was validated, but we could not find map coordinates. Please try a more specific address.'],
        ]);
    }
}
