<?php

namespace Tests\Feature\TimezoneProviders;

use App\Services\TimezoneProviders\GoogleTimeZoneProvider;
use App\Services\TimezoneProviders\TimezoneProviderException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class GoogleTimeZoneProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_is_not_configured_without_an_api_key(): void
    {
        config(['services.timezone_lookup.google_api_key' => null]);
        $this->assertFalse((new GoogleTimeZoneProvider())->isConfigured());
    }

    public function test_it_is_configured_with_an_api_key(): void
    {
        config(['services.timezone_lookup.google_api_key' => 'AIzaFakeKey']);
        $this->assertTrue((new GoogleTimeZoneProvider())->isConfigured());
    }

    public function test_it_resolves_the_timezoneid_field_when_status_is_ok(): void
    {
        config(['services.timezone_lookup.google_api_key' => 'AIzaFakeKey']);
        Http::fake(['maps.googleapis.com/*' => Http::response([
            'status' => 'OK',
            'timeZoneId' => 'America/Los_Angeles',
            'timeZoneName' => 'Pacific Daylight Time',
        ], 200)]);

        $this->assertSame('America/Los_Angeles', (new GoogleTimeZoneProvider())->resolve(47.6062, -122.3321));
    }

    public function test_it_treats_a_non_ok_status_as_failure_even_with_http_200(): void
    {
        // Verified live (no key configured): Google returns HTTP 200 with
        // {"status":"REQUEST_DENIED", "errorMessage": "..."} rather than a non-2xx status.
        config(['services.timezone_lookup.google_api_key' => 'AIzaFakeKey']);
        Http::fake(['maps.googleapis.com/*' => Http::response([
            'status' => 'REQUEST_DENIED',
            'errorMessage' => 'You must use an API key to authenticate each request.',
        ], 200)]);

        try {
            (new GoogleTimeZoneProvider())->resolve(47.6062, -122.3321);
            $this->fail('Expected TimezoneProviderException.');
        } catch (TimezoneProviderException $exception) {
            $this->assertSame('google', $exception->providerName);
            $this->assertSame('missing_or_unusable_timezone_field', $exception->reason);
        }
    }

    public function test_it_treats_over_query_limit_as_failure_so_the_next_provider_can_be_tried(): void
    {
        config(['services.timezone_lookup.google_api_key' => 'AIzaFakeKey']);
        Http::fake(['maps.googleapis.com/*' => Http::response(['status' => 'OVER_QUERY_LIMIT'], 200)]);

        $this->expectException(TimezoneProviderException::class);
        (new GoogleTimeZoneProvider())->resolve(0.0, 0.0);
    }

    public function test_the_api_key_never_appears_in_logs(): void
    {
        config(['services.timezone_lookup.google_api_key' => 'super-secret-key']);
        Http::fake(['maps.googleapis.com/*' => Http::response(['status' => 'OK', 'timeZoneId' => 'America/Chicago'], 200)]);
        Log::spy();

        (new GoogleTimeZoneProvider())->resolve(41.8781, -87.6298);

        Log::shouldHaveReceived('info')->withArgs(function ($message, $context) {
            return $message === 'Timezone provider request starting.'
                && ! str_contains($context['request_url'], 'super-secret-key')
                && str_contains($context['request_url'], 'redacted');
        })->once();

        Http::assertSent(fn ($request) => str_contains($request->url(), 'key=super-secret-key'));
    }
}
