<?php

namespace Tests\Feature;

use App\Services\GeocodingService;
use App\Services\TimezoneLookupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Covers the TEMPORARY diagnostics endpoint added for the production timezone-detection
 * incident (see TIMEZONE_PRODUCTION_DEBUG_REPORT.md). Delete this test alongside the
 * controller/route once the incident is resolved.
 */
class TimezoneDiagnosticsControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_404s_when_no_debug_token_is_configured(): void
    {
        putenv('TIMEZONE_DEBUG_TOKEN');

        $this->getJson('/api/_debug/timezone-lookup', ['X-Debug-Token' => 'anything'])
            ->assertNotFound();
    }

    public function test_it_404s_when_the_supplied_token_does_not_match(): void
    {
        putenv('TIMEZONE_DEBUG_TOKEN=correct-token');

        $this->getJson('/api/_debug/timezone-lookup', ['X-Debug-Token' => 'wrong-token'])
            ->assertNotFound();

        putenv('TIMEZONE_DEBUG_TOKEN');
    }

    public function test_it_returns_a_full_diagnostic_report_with_a_valid_token(): void
    {
        putenv('TIMEZONE_DEBUG_TOKEN=correct-token');

        $this->app->instance(GeocodingService::class, new class extends GeocodingService {
            public function geocode(array $address): array
            {
                return ['latitude' => 47.6062, 'longitude' => -122.3321, 'geocoding_provider' => 'nominatim'];
            }
        });
        $this->app->instance(TimezoneLookupService::class, new class extends TimezoneLookupService {
            public function resolve(float $latitude, float $longitude): string
            {
                return 'America/Los_Angeles';
            }
        });
        Http::fake([
            'www.timeapi.io/*' => Http::response(['timeZone' => 'America/Los_Angeles'], 200),
            'nominatim.openstreetmap.org/*' => Http::response([['lat' => '47.6062', 'lon' => '-122.3321']], 200),
        ]);

        $response = $this->getJson('/api/_debug/timezone-lookup?latitude=47.6062&longitude=-122.3321', [
            'X-Debug-Token' => 'correct-token',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'deployment' => ['git_commit', 'git_status_short', 'php_version', 'server_time', 'opcache_enabled'],
                'config' => ['config_is_cached', 'timezone_lookup_base_url', 'geonames_username_configured', 'google_api_key_configured', 'geocoder_provider', 'nominatim_base_url'],
                'connectivity',
                'geocoding',
                'timezone_lookup' => ['request_url', 'http_status', 'raw_response_body', 'decoded_json', 'duration_ms'],
                'final_api_response',
            ])
            ->assertJsonPath('timezone_lookup.http_status', 200)
            ->assertJsonPath('timezone_lookup.decoded_json.timeZone', 'America/Los_Angeles')
            ->assertJsonPath('final_api_response.timezone', 'America/Los_Angeles')
            ->assertJsonPath('config.timezone_lookup_base_url', 'https://www.timeapi.io');

        putenv('TIMEZONE_DEBUG_TOKEN');
    }

    public function test_reset_opcache_flag_is_opt_in_and_reports_its_own_outcome(): void
    {
        putenv('TIMEZONE_DEBUG_TOKEN=correct-token');

        $this->app->instance(GeocodingService::class, new class extends GeocodingService {
            public function geocode(array $address): array
            {
                return ['latitude' => 47.6062, 'longitude' => -122.3321, 'geocoding_provider' => 'nominatim'];
            }
        });
        $this->app->instance(TimezoneLookupService::class, new class extends TimezoneLookupService {
            public function resolve(float $latitude, float $longitude): string
            {
                return 'America/Los_Angeles';
            }
        });
        Http::fake();

        $withoutReset = $this->getJson('/api/_debug/timezone-lookup', ['X-Debug-Token' => 'correct-token']);
        $withoutReset->assertOk()->assertJsonPath('opcache_reset_requested', null);

        $withReset = $this->getJson('/api/_debug/timezone-lookup?reset_opcache=1', ['X-Debug-Token' => 'correct-token']);
        $withReset->assertOk();
        $this->assertNotNull($withReset->json('opcache_reset_requested'));

        putenv('TIMEZONE_DEBUG_TOKEN');
    }
}
