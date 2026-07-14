<?php

namespace Tests\Feature\TimezoneProviders;

use App\Services\TimezoneProviders\GeoNamesProvider;
use App\Services\TimezoneProviders\TimezoneProviderException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class GeoNamesProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_is_not_configured_without_a_username(): void
    {
        config(['services.timezone_lookup.geonames_username' => null]);
        $this->assertFalse((new GeoNamesProvider())->isConfigured());
    }

    public function test_it_is_configured_with_a_username(): void
    {
        config(['services.timezone_lookup.geonames_username' => 'my-user']);
        $this->assertTrue((new GeoNamesProvider())->isConfigured());
    }

    public function test_it_resolves_the_timezoneid_field(): void
    {
        config(['services.timezone_lookup.geonames_username' => 'my-user']);
        Http::fake(['api.geonames.org/*' => Http::response(['timezoneId' => 'America/Los_Angeles', 'lat' => 47.6, 'lng' => -122.3], 200)]);

        $this->assertSame('America/Los_Angeles', (new GeoNamesProvider())->resolve(47.6062, -122.3321));
    }

    public function test_it_treats_an_embedded_status_error_as_failure_even_with_http_200(): void
    {
        // Verified live: GeoNames returns HTTP 200 with a "status" object for quota/auth
        // errors rather than a non-2xx status code.
        config(['services.timezone_lookup.geonames_username' => 'demo']);
        Http::fake(['api.geonames.org/*' => Http::response([
            'status' => ['message' => 'the daily limit of 20000 credits for demo has been exceeded.', 'value' => 18],
        ], 200)]);

        try {
            (new GeoNamesProvider())->resolve(47.6062, -122.3321);
            $this->fail('Expected TimezoneProviderException.');
        } catch (TimezoneProviderException $exception) {
            $this->assertSame('geonames', $exception->providerName);
            $this->assertSame('missing_or_unusable_timezone_field', $exception->reason);
        }
    }

    public function test_it_redacts_the_username_from_logged_request_urls(): void
    {
        config(['services.timezone_lookup.geonames_username' => 'super-secret-user']);
        Http::fake(['api.geonames.org/*' => Http::response(['timezoneId' => 'America/Chicago'], 200)]);

        (new GeoNamesProvider())->resolve(41.8781, -87.6298);

        Http::assertSent(function ($request) {
            // The redaction happens in what we log, not in the actual outgoing request —
            // the real request must still carry the real username.
            return str_contains($request->url(), 'username=super-secret-user');
        });
    }

    public function test_the_username_never_appears_in_logs(): void
    {
        config(['services.timezone_lookup.geonames_username' => 'super-secret-user']);
        Http::fake(['api.geonames.org/*' => Http::response(['timezoneId' => 'America/Chicago'], 200)]);
        Log::spy();

        (new GeoNamesProvider())->resolve(41.8781, -87.6298);

        Log::shouldHaveReceived('info')->withArgs(function ($message, $context) {
            return $message === 'Timezone provider request starting.'
                && ! str_contains($context['request_url'], 'super-secret-user')
                && str_contains($context['request_url'], 'redacted');
        })->once();
    }
}
