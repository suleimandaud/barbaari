<?php

namespace App\Services\TimezoneProviders;

/**
 * Extension point for an offline, dependency-free lat/lng-to-IANA-timezone lookup (e.g. a
 * point-in-polygon match against a bundled timezone boundary dataset), so a total outage of
 * every external provider still degrades to a working local lookup instead of a validation
 * error.
 *
 * No such package is installed as of this writing. This was researched deliberately: every
 * offline PHP package found on Packagist for this exact purpose (e.g. abdalasif/geo-timezone)
 * is effectively unmaintained (single-digit GitHub stars, under 200 all-time downloads) and
 * not something to depend on for accuracy — especially given this feature must distinguish
 * Phoenix (America/Phoenix, no DST) from Denver (America/Denver, observes DST) despite both
 * sitting in the same longitude band, which a naive/low-quality implementation reliably gets
 * wrong. Shipping a fabricated approximation would silently produce wrong timezones, which is
 * worse than the current behavior of failing loudly.
 *
 * This class exists so that if a real offline library (or a vendored timezone-boundary
 * dataset) is added later, activating it requires no changes anywhere else — it plugs into
 * the same TimezoneLookupService fallback chain via isConfigured(). Until then, isConfigured()
 * returns false and this provider is always skipped.
 */
class OfflineTimezoneProvider implements TimezoneProviderInterface
{
    public function name(): string
    {
        return 'offline';
    }

    public function isConfigured(): bool
    {
        // Placeholder class name for a future offline lookup package/vendored dataset.
        // Deliberately a string, not a ::class reference, so nothing needs to exist or be
        // autoloadable for this file to be valid — it's a no-op check today by design.
        return class_exists('App\\Services\\TimezoneProviders\\Support\\OfflineTimezoneLookupLibrary');
    }

    public function resolve(float $latitude, float $longitude): string
    {
        throw new TimezoneProviderException($this->name(), 'not_installed', [
            'hint' => 'No offline timezone lookup package is installed. See class docblock.',
        ]);
    }
}
