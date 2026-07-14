<?php

namespace App\Services\TimezoneProviders;

interface TimezoneProviderInterface
{
    /**
     * Short, stable identifier used in logs. Never shown to end users.
     */
    public function name(): string;

    /**
     * Whether this provider has everything it needs (API key/username/package) to be
     * attempted at all. A provider that isn't configured is skipped silently in the
     * fallback chain — that is not treated as a failure.
     */
    public function isConfigured(): bool;

    /**
     * Resolve a validated IANA timezone identifier for the given coordinates.
     *
     * @throws TimezoneProviderException on any failure — network, HTTP status, malformed
     *         body, missing field, or an invalid (non-IANA) timezone value. Never returns
     *         an unvalidated or partial result.
     */
    public function resolve(float $latitude, float $longitude): string;
}
