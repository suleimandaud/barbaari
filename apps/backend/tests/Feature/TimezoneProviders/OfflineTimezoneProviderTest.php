<?php

namespace Tests\Feature\TimezoneProviders;

use App\Services\TimezoneProviders\OfflineTimezoneProvider;
use App\Services\TimezoneProviders\TimezoneProviderException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OfflineTimezoneProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_is_not_configured_because_no_offline_package_is_installed(): void
    {
        $this->assertFalse((new OfflineTimezoneProvider())->isConfigured());
    }

    public function test_it_throws_rather_than_ever_return_an_unvalidated_guess_if_called_anyway(): void
    {
        $this->expectException(TimezoneProviderException::class);
        (new OfflineTimezoneProvider())->resolve(47.6062, -122.3321);
    }
}
