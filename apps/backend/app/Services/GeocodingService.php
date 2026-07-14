<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
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
        $freeformQuery = $address['standardized_address'] ?? implode(', ', array_filter([
            $address['address_line1'] ?? null,
            $address['address_line2'] ?? null,
            $address['city'] ?? null,
            $address['state'] ?? null,
            $address['postal_code'] ?? null,
            $address['country'] ?? 'US',
        ]));

        $result = $this->searchNominatim($baseUrl, ['format' => 'jsonv2', 'limit' => 1, 'countrycodes' => 'us', 'q' => $freeformQuery], 'freeform');

        // Nominatim's free-text parser occasionally fails to match USPS-standardized
        // strings (e.g. abbreviations, secondary unit designators) that it can match
        // when the same components are supplied as separate structured fields. Retry
        // once with structured params before giving up.
        if ($result === null && ! empty($address['address_line1'])) {
            $result = $this->searchNominatim($baseUrl, array_filter([
                'format' => 'jsonv2',
                'limit' => 1,
                'countrycodes' => 'us',
                'street' => $address['address_line1'],
                'city' => $address['city'] ?? null,
                'state' => $address['state'] ?? null,
                'postalcode' => $address['postal_code'] ?? null,
                'country' => $address['country'] ?? 'US',
            ]), 'structured');
        }

        if ($result === null) {
            throw $this->geocodingFailed();
        }

        return [
            'latitude' => round((float) $result['lat'], 7),
            'longitude' => round((float) $result['lon'], 7),
            'geocoding_provider' => 'nominatim',
        ];
    }

    private function searchNominatim(string $baseUrl, array $query, string $queryStrategy): ?array
    {
        $requestUrl = $baseUrl.'/search?'.http_build_query($query);

        try {
            $response = Http::withHeaders([
                'User-Agent' => config('app.name', 'Barbaari').'/address-validation '.config('app.url'),
            ])
                ->acceptJson()
                ->timeout(12)
                ->retry(1, 400, throw: false)
                ->get($baseUrl.'/search', $query);
        } catch (ConnectionException $exception) {
            Log::error('Geocoding request failed before receiving a response (connectivity).', [
                'provider' => 'nominatim',
                'query_strategy' => $queryStrategy,
                'request_url' => $requestUrl,
                'exception_class' => $exception::class,
                'error' => $exception->getMessage(),
            ]);

            return null;
        } catch (\Throwable $exception) {
            Log::error('Geocoding request failed with an unexpected exception.', [
                'provider' => 'nominatim',
                'query_strategy' => $queryStrategy,
                'request_url' => $requestUrl,
                'exception_class' => $exception::class,
                'error' => $exception->getMessage(),
            ]);

            return null;
        }

        $rawBody = $response->body();

        if (! $response->successful()) {
            Log::error('Geocoding received a non-success HTTP status.', [
                'provider' => 'nominatim',
                'query_strategy' => $queryStrategy,
                'request_url' => $requestUrl,
                'status' => $response->status(),
                'raw_response_body' => $rawBody,
            ]);

            return null;
        }

        $decoded = json_decode($rawBody, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            Log::error('Geocoding returned a body that is not valid JSON.', [
                'provider' => 'nominatim',
                'query_strategy' => $queryStrategy,
                'request_url' => $requestUrl,
                'raw_response_body' => $rawBody,
                'json_error' => json_last_error_msg(),
            ]);

            return null;
        }

        if (empty($decoded)) {
            // A 200 with an empty array is Nominatim's normal response for "no match" —
            // this is also the symptom of silent usage-policy throttling on the free
            // public instance (>1 req/sec), so the query strategy and raw body are
            // logged to tell the two apart after the fact.
            Log::info('Geocoding did not return coordinates.', [
                'provider' => 'nominatim',
                'query_strategy' => $queryStrategy,
                'request_url' => $requestUrl,
                'status' => $response->status(),
                'raw_response_body' => $rawBody,
            ]);

            return null;
        }

        $result = $decoded[0] ?? null;
        if (! isset($result['lat'], $result['lon'])) {
            Log::warning('Geocoding response result is missing lat/lon.', [
                'provider' => 'nominatim',
                'query_strategy' => $queryStrategy,
                'request_url' => $requestUrl,
                'decoded_json' => $decoded,
            ]);

            return null;
        }

        Log::info('Geocoding succeeded.', [
            'provider' => 'nominatim',
            'query_strategy' => $queryStrategy,
            'request_url' => $requestUrl,
            'latitude' => (float) $result['lat'],
            'longitude' => (float) $result['lon'],
        ]);

        return $result;
    }

    private function geocodingFailed(): ValidationException
    {
        return ValidationException::withMessages([
            'address' => ['Address was validated, but we could not find map coordinates. Please try a more specific address.'],
        ]);
    }
}
