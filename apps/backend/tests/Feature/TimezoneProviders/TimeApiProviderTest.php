<?php

namespace Tests\Feature\TimezoneProviders;

use App\Services\TimezoneProviders\TimeApiProvider;
use App\Services\TimezoneProviders\TimezoneProviderException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class TimeApiProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_is_configured_by_default(): void
    {
        $this->assertTrue((new TimeApiProvider())->isConfigured());
    }

    public function test_it_is_not_configured_when_base_url_is_empty(): void
    {
        config(['services.timezone_lookup.timeapi_base_url' => '']);
        $this->assertFalse((new TimeApiProvider())->isConfigured());
    }

    public function test_it_resolves_a_valid_timezone(): void
    {
        Http::fake(['www.timeapi.io/*' => Http::response(['timeZone' => 'America/Los_Angeles'], 200)]);

        $this->assertSame('America/Los_Angeles', (new TimeApiProvider())->resolve(47.6062, -122.3321));
    }

    public function test_it_sends_accept_json_and_a_user_agent(): void
    {
        Http::fake(['www.timeapi.io/*' => Http::response(['timeZone' => 'America/New_York'], 200)]);

        (new TimeApiProvider())->resolve(40.7128, -74.0060);

        Http::assertSent(function ($request) {
            return $request->hasHeader('Accept', 'application/json')
                && str_contains((string) $request->header('User-Agent')[0], 'timezone-lookup');
        });
    }

    public function test_it_retries_after_a_transient_500_and_then_succeeds(): void
    {
        $attempt = 0;
        Http::fake(function () use (&$attempt) {
            $attempt++;

            return $attempt === 1 ? Http::response('error', 500) : Http::response(['timeZone' => 'America/Chicago'], 200);
        });

        $this->assertSame('America/Chicago', (new TimeApiProvider())->resolve(41.8781, -87.6298));
        $this->assertSame(2, $attempt);
    }

    public function test_it_throws_provider_exception_on_persistent_non_success_status(): void
    {
        Http::fake(['www.timeapi.io/*' => Http::response('down', 503)]);

        try {
            (new TimeApiProvider())->resolve(0.0, 0.0);
            $this->fail('Expected TimezoneProviderException.');
        } catch (TimezoneProviderException $exception) {
            $this->assertSame('timeapi', $exception->providerName);
            $this->assertSame('http_error_status', $exception->reason);
            $this->assertSame(503, $exception->context['http_status']);
        }
    }

    public function test_it_throws_provider_exception_on_non_json_body_html_challenge_page(): void
    {
        Http::fake(['www.timeapi.io/*' => Http::response('<html><body>Attention Required! | Cloudflare</body></html>', 200)]);

        try {
            (new TimeApiProvider())->resolve(0.0, 0.0);
            $this->fail('Expected TimezoneProviderException.');
        } catch (TimezoneProviderException $exception) {
            $this->assertSame('invalid_json', $exception->reason);
        }
    }

    public function test_it_throws_provider_exception_when_timezone_field_is_missing(): void
    {
        Http::fake(['www.timeapi.io/*' => Http::response(['somethingElse' => true], 200)]);

        try {
            (new TimeApiProvider())->resolve(0.0, 0.0);
            $this->fail('Expected TimezoneProviderException.');
        } catch (TimezoneProviderException $exception) {
            $this->assertSame('missing_or_unusable_timezone_field', $exception->reason);
        }
    }

    public function test_it_throws_provider_exception_when_timezone_is_not_a_valid_iana_identifier(): void
    {
        Http::fake(['www.timeapi.io/*' => Http::response(['timeZone' => 'Not/ARealZone'], 200)]);

        try {
            (new TimeApiProvider())->resolve(0.0, 0.0);
            $this->fail('Expected TimezoneProviderException.');
        } catch (TimezoneProviderException $exception) {
            $this->assertSame('invalid_iana_timezone', $exception->reason);
        }
    }

    public function test_it_categorizes_a_dns_connection_failure_and_logs_it(): void
    {
        Http::fake(function () {
            throw new ConnectionException('cURL error 6: Could not resolve host: www.timeapi.io');
        });
        Log::spy();

        try {
            (new TimeApiProvider())->resolve(0.0, 0.0);
            $this->fail('Expected TimezoneProviderException.');
        } catch (TimezoneProviderException $exception) {
            $this->assertSame('connection_failure', $exception->reason);
            $this->assertSame('dns', $exception->context['failure_category']);
        }

        Log::shouldHaveReceived('warning')->withArgs(function ($message, $context) {
            return $message === 'Timezone provider failed.' && $context['provider'] === 'timeapi' && $context['reason'] === 'connection_failure';
        })->once();
    }

    public function test_it_truncates_a_very_long_response_body_in_logs(): void
    {
        Http::fake(['www.timeapi.io/*' => Http::response(str_repeat('x', 5000), 500)]);
        Log::spy();

        try {
            (new TimeApiProvider())->resolve(0.0, 0.0);
        } catch (TimezoneProviderException) {
        }

        Log::shouldHaveReceived('warning')->withArgs(function ($message, $context) {
            return $message === 'Timezone provider failed.' && strlen($context['response_body']) < 5000;
        })->once();
    }
}
