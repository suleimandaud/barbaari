<?php

namespace Tests\Feature;

use App\Services\GeocodingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class GeocodingServiceTest extends TestCase
{
    use RefreshDatabase;

    private array $standardAddress = [
        'address_line1' => '233 S WACKER DR',
        'address_line2' => null,
        'city' => 'CHICAGO',
        'state' => 'IL',
        'postal_code' => '60606',
        'country' => 'US',
        'standardized_address' => '233 S WACKER DR, CHICAGO, IL 60606',
    ];

    public function test_it_resolves_coordinates_from_the_freeform_query(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/search*' => Http::response([
                ['lat' => '41.8787', 'lon' => '-87.6360'],
            ], 200),
        ]);

        $coordinates = app(GeocodingService::class)->geocode($this->standardAddress);

        $this->assertSame(41.8787, $coordinates['latitude']);
        $this->assertSame(-87.636, $coordinates['longitude']);
        $this->assertSame('nominatim', $coordinates['geocoding_provider']);
    }

    public function test_it_falls_back_to_structured_query_when_freeform_returns_no_match(): void
    {
        $calls = [];
        Http::fake(function ($request) use (&$calls) {
            $query = [];
            parse_str(parse_url($request->url(), PHP_URL_QUERY), $query);
            $calls[] = $query;

            if (isset($query['q'])) {
                return Http::response([], 200);
            }

            return Http::response([['lat' => '41.8787', 'lon' => '-87.6360']], 200);
        });

        $coordinates = app(GeocodingService::class)->geocode($this->standardAddress);

        $this->assertSame(41.8787, $coordinates['latitude']);
        $this->assertCount(2, $calls);
        $this->assertArrayHasKey('q', $calls[0]);
        $this->assertArrayHasKey('street', $calls[1]);
        $this->assertSame('233 S WACKER DR', $calls[1]['street']);
    }

    public function test_it_throws_friendly_error_and_logs_raw_body_when_both_strategies_return_no_match(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/*' => Http::response([], 200),
        ]);
        Log::spy();

        $this->expectException(ValidationException::class);

        try {
            app(GeocodingService::class)->geocode($this->standardAddress);
        } finally {
            Log::shouldHaveReceived('info')->withArgs(function ($message, $context) {
                return $message === 'Geocoding did not return coordinates.' && $context['query_strategy'] === 'freeform';
            })->once();
            Log::shouldHaveReceived('info')->withArgs(function ($message, $context) {
                return $message === 'Geocoding did not return coordinates.' && $context['query_strategy'] === 'structured';
            })->once();
        }
    }

    public function test_it_logs_status_and_raw_body_on_non_success_http_status(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/*' => Http::response('rate limited', 429),
        ]);
        Log::spy();

        $this->expectException(ValidationException::class);

        try {
            app(GeocodingService::class)->geocode($this->standardAddress);
        } finally {
            Log::shouldHaveReceived('error')->withArgs(function ($message, $context) {
                return $message === 'Geocoding received a non-success HTTP status.'
                    && $context['status'] === 429
                    && $context['raw_response_body'] === 'rate limited';
            })->atLeast()->once();
        }
    }
}
