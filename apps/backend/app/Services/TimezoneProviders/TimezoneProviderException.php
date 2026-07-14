<?php

namespace App\Services\TimezoneProviders;

/**
 * Internal, provider-level failure. Always caught by TimezoneLookupService and never
 * exposed to the end user — the orchestrator logs the reason/context (for operators) and
 * either moves on to the next provider or, if all providers are exhausted, throws a single
 * generic ValidationException that names no provider.
 */
class TimezoneProviderException extends \RuntimeException
{
    public function __construct(
        public readonly string $providerName,
        public readonly string $reason,
        public readonly array $context = [],
        ?string $message = null,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message ?? "{$providerName} timezone lookup failed: {$reason}", 0, $previous);
    }
}
