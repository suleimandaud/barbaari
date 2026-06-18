<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class USPSAddressService
{
    public function validate(array $address): array
    {
        if (strtoupper((string) ($address['country'] ?? 'US')) !== 'US') {
            throw ValidationException::withMessages([
                'address' => ['USPS address validation is available for US addresses only.'],
            ]);
        }

        $token = $this->token();
        $baseUrl = rtrim((string) config('services.usps.base_url'), '/');

        try {
            $response = Http::withToken($token)
                ->acceptJson()
                ->timeout(12)
                ->get($baseUrl.'/addresses/v3/address', [
                    'streetAddress' => $address['address_line1'],
                    'secondaryAddress' => $address['address_line2'] ?? null,
                    'city' => $address['city'],
                    'state' => $address['state'],
                    'ZIPCode' => $address['postal_code'],
                ]);
        } catch (\Throwable $exception) {
            Log::warning('USPS address validation request failed.', ['error' => $exception->getMessage()]);
            throw ValidationException::withMessages([
                'address' => ['We could not validate this address. Please check the street, city, state, and ZIP code.'],
            ]);
        }

        if (! $response->successful()) {
            Log::info('USPS address validation rejected address.', [
                'status' => $response->status(),
                'error' => $response->json('error.message') ?? $response->json('message'),
            ]);
            throw ValidationException::withMessages([
                'address' => ['We could not validate this address. Please check the street, city, state, and ZIP code.'],
            ]);
        }

        $payload = $response->json();
        $standardized = $this->standardizedAddress($payload, $address);
        if (! $standardized['address_line1'] || ! $standardized['city'] || ! $standardized['state'] || ! $standardized['postal_code']) {
            throw ValidationException::withMessages([
                'address' => ['We could not validate this address. Please check the street, city, state, and ZIP code.'],
            ]);
        }

        return $standardized;
    }

    private function token(): string
    {
        $consumerKey = config('services.usps.consumer_key');
        $consumerSecret = config('services.usps.consumer_secret');

        if (! $consumerKey || ! $consumerSecret) {
            throw ValidationException::withMessages([
                'address' => ['Address validation is not configured.'],
            ]);
        }

        return Cache::remember('usps.oauth_token', now()->addMinutes(55), function () use ($consumerKey, $consumerSecret) {
            $baseUrl = rtrim((string) config('services.usps.base_url'), '/');
            $response = Http::asForm()
                ->acceptJson()
                ->timeout(12)
                ->post($baseUrl.'/oauth2/v3/token', [
                    'grant_type' => 'client_credentials',
                    'client_id' => $consumerKey,
                    'client_secret' => $consumerSecret,
                ]);

            if (! $response->successful() || ! $response->json('access_token')) {
                Log::warning('USPS OAuth token request failed.', ['status' => $response->status()]);
                throw ValidationException::withMessages([
                    'address' => ['Address validation is not configured.'],
                ]);
            }

            $expiresIn = max(60, (int) $response->json('expires_in', 3600) - 300);
            Cache::put('usps.oauth_token', $response->json('access_token'), now()->addSeconds($expiresIn));

            return $response->json('access_token');
        });
    }

    private function standardizedAddress(array $payload, array $fallback): array
    {
        $address = $payload['address'] ?? $payload['addresses'][0] ?? $payload;
        $line1 = $address['streetAddress'] ?? $address['street_address'] ?? $address['address_line1'] ?? $fallback['address_line1'];
        $line2 = $address['secondaryAddress'] ?? $address['secondary_address'] ?? $address['address_line2'] ?? ($fallback['address_line2'] ?? null);
        $city = $address['city'] ?? $fallback['city'];
        $state = $address['state'] ?? $fallback['state'];
        $zip = $address['ZIPCode'] ?? $address['zipCode'] ?? $address['postal_code'] ?? $fallback['postal_code'];
        $zip4 = $address['ZIPPlus4'] ?? $address['zipPlus4'] ?? null;
        $postalCode = $zip4 ? sprintf('%s-%s', $zip, $zip4) : $zip;

        $parts = array_filter([$line1, $line2, trim(sprintf('%s, %s %s', $city, $state, $postalCode))]);

        return [
            'address_line1' => trim((string) $line1),
            'address_line2' => $line2 ? trim((string) $line2) : null,
            'city' => trim((string) $city),
            'state' => strtoupper(trim((string) $state)),
            'postal_code' => trim((string) $postalCode),
            'country' => 'US',
            'standardized_address' => implode(', ', $parts),
        ];
    }
}
