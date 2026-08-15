<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_reports_ok_when_every_dependency_is_reachable(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertOk();
        $response->assertJsonPath('status', 'ok');
        $response->assertJsonPath('checks.database.status', 'pass');
        $response->assertJsonPath('checks.cache.status', 'pass');
        $response->assertJsonPath('checks.filesystem.status', 'pass');
        $response->assertJsonPath('checks.environment.status', 'pass');
    }

    public function test_health_endpoint_returns_503_when_a_critical_check_fails(): void
    {
        config(['filesystems.default' => 'nonexistent-disk-for-test']);

        $response = $this->getJson('/api/health');

        $response->assertStatus(503);
        $response->assertJsonPath('status', 'down');
        $response->assertJsonPath('checks.filesystem.status', 'fail');
    }

    public function test_health_endpoint_does_not_fail_the_whole_response_for_a_non_critical_check(): void
    {
        config(['mail.default' => 'nonexistent-mailer-for-test']);

        $response = $this->getJson('/api/health');

        $response->assertOk();
        $response->assertJsonPath('status', 'ok');
        $response->assertJsonPath('checks.mail.status', 'warn');
    }
}
