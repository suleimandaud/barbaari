<?php

namespace Tests\Feature;

use App\Services\TimezoneLookupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class TimezoneLookupServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_resolves_a_valid_iana_timezone_from_the_lookup_provider(): void
    {
        Http::fake([
            'www.timeapi.io/api/timezone/coordinate*' => Http::response(['timeZone' => 'America/Los_Angeles'], 200),
        ]);

        $timezone = app(TimezoneLookupService::class)->resolve(47.6062, -122.3321);

        $this->assertSame('America/Los_Angeles', $timezone);
        Http::assertSent(function ($request) {
            return $request->url() === 'https://www.timeapi.io/api/timezone/coordinate?latitude=47.6062&longitude=-122.3321'
                || str_contains($request->url(), '/api/timezone/coordinate');
        });
    }

    public function test_it_throws_a_friendly_validation_error_when_the_provider_is_unreachable(): void
    {
        Http::fake([
            'www.timeapi.io/*' => Http::response(null, 500),
        ]);

        try {
            app(TimezoneLookupService::class)->resolve(47.6062, -122.3321);
            $this->fail('Expected a ValidationException to be thrown.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('address', $exception->errors());
            $this->assertSame(
                'We could not automatically determine the timezone for this address. Please double-check the address and try again.',
                $exception->errors()['address'][0]
            );
        }
    }

    public function test_it_throws_a_friendly_validation_error_when_the_provider_returns_an_invalid_timezone(): void
    {
        Http::fake([
            'www.timeapi.io/*' => Http::response(['timeZone' => 'Not/ARealZone'], 200),
        ]);

        $this->expectException(ValidationException::class);

        app(TimezoneLookupService::class)->resolve(0.0, 0.0);
    }

    public function test_it_throws_a_friendly_validation_error_when_the_provider_returns_no_body(): void
    {
        Http::fake([
            'www.timeapi.io/*' => Http::response([], 200),
        ]);

        $this->expectException(ValidationException::class);

        app(TimezoneLookupService::class)->resolve(0.0, 0.0);
    }
}
