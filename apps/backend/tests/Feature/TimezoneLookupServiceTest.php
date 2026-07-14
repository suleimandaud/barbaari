<?php

namespace Tests\Feature;

use App\Services\TimezoneLookupService;
use App\Services\TimezoneProviders\TimezoneProviderException;
use App\Services\TimezoneProviders\TimezoneProviderInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Orchestrator-level behavior: fallback ordering, skip-if-unconfigured, and the
 * all-providers-exhausted failure path. Per-provider HTTP behavior (retry, timeouts,
 * response parsing) is covered separately in tests/Feature/TimezoneProviders/.
 */
class TimezoneLookupServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_the_first_successful_providers_timezone(): void
    {
        $service = new TimezoneLookupService([
            $this->fakeProvider('first', 'America/Los_Angeles'),
            $this->fakeProvider('second', 'America/New_York'),
        ]);

        $this->assertSame('America/Los_Angeles', $service->resolve(47.6062, -122.3321));
    }

    public function test_provider_1_failure_falls_through_to_provider_2(): void
    {
        Log::spy();

        $service = new TimezoneLookupService([
            $this->failingProvider('first', 'http_error_status'),
            $this->fakeProvider('second', 'America/New_York'),
        ]);

        $this->assertSame('America/New_York', $service->resolve(40.7128, -74.0060));

        Log::shouldHaveReceived('info')->withArgs(function ($message, $context) {
            return $message === 'Timezone lookup resolved.'
                && $context['provider_used'] === 'second'
                && $context['fallback_used'] === true
                && $context['providers_attempted'] === ['first', 'second'];
        })->once();
    }

    public function test_provider_1_timeout_falls_through_to_provider_2(): void
    {
        $service = new TimezoneLookupService([
            $this->failingProvider('first', 'connection_failure'),
            $this->fakeProvider('second', 'America/Chicago'),
        ]);

        $this->assertSame('America/Chicago', $service->resolve(41.8781, -87.6298));
    }

    public function test_unconfigured_providers_are_skipped_without_being_attempted(): void
    {
        $skippable = new class implements TimezoneProviderInterface {
            public bool $wasResolveCalled = false;

            public function name(): string
            {
                return 'skippable';
            }

            public function isConfigured(): bool
            {
                return false;
            }

            public function resolve(float $latitude, float $longitude): string
            {
                $this->wasResolveCalled = true;

                return 'should-not-happen';
            }
        };

        $service = new TimezoneLookupService([
            $skippable,
            $this->fakeProvider('real', 'America/Phoenix'),
        ]);

        $this->assertSame('America/Phoenix', $service->resolve(33.4484, -112.0740));
        $this->assertFalse($skippable->wasResolveCalled);
    }

    public function test_when_every_provider_fails_it_throws_one_generic_friendly_error_naming_no_provider(): void
    {
        Log::spy();

        $service = new TimezoneLookupService([
            $this->failingProvider('first', 'http_error_status'),
            $this->failingProvider('second', 'invalid_json'),
        ]);

        try {
            $service->resolve(0.0, 0.0);
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $exception) {
            $message = $exception->errors()['address'][0];
            $this->assertSame(
                'We could not automatically determine the timezone for this address. Please double-check the address and try again.',
                $message
            );
            $this->assertStringNotContainsString('first', $message);
            $this->assertStringNotContainsString('second', $message);
            $this->assertStringNotContainsString('timeapi', strtolower($message));
            $this->assertStringNotContainsString('geonames', strtolower($message));
            $this->assertStringNotContainsString('google', strtolower($message));
        }

        Log::shouldHaveReceived('error')->withArgs(function ($message, $context) {
            return $message === 'Timezone lookup failed: every configured provider was exhausted.'
                && $context['providers_attempted'] === ['first', 'second'];
        })->once();
    }

    public function test_when_all_providers_are_unconfigured_it_still_throws_the_generic_friendly_error(): void
    {
        $unconfigured = new class implements TimezoneProviderInterface {
            public function name(): string
            {
                return 'unconfigured';
            }

            public function isConfigured(): bool
            {
                return false;
            }

            public function resolve(float $latitude, float $longitude): string
            {
                throw new \LogicException('should never be called');
            }
        };

        $service = new TimezoneLookupService([$unconfigured]);

        $this->expectException(ValidationException::class);
        $service->resolve(47.6062, -122.3321);
    }

    public function test_real_container_binding_resolves_with_the_default_provider_chain(): void
    {
        $service = app(TimezoneLookupService::class);
        $this->assertInstanceOf(TimezoneLookupService::class, $service);
    }

    private function fakeProvider(string $name, string $timezone): TimezoneProviderInterface
    {
        return new class($name, $timezone) implements TimezoneProviderInterface {
            public function __construct(private string $providerName, private string $timezone)
            {
            }

            public function name(): string
            {
                return $this->providerName;
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function resolve(float $latitude, float $longitude): string
            {
                return $this->timezone;
            }
        };
    }

    private function failingProvider(string $name, string $reason): TimezoneProviderInterface
    {
        return new class($name, $reason) implements TimezoneProviderInterface {
            public function __construct(private string $providerName, private string $reason)
            {
            }

            public function name(): string
            {
                return $this->providerName;
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function resolve(float $latitude, float $longitude): string
            {
                throw new TimezoneProviderException($this->providerName, $this->reason);
            }
        };
    }
}
