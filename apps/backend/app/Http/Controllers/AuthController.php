<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\OrganizationInvitation;
use App\Models\PlatformInvoice;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\OrganizationSetting;
use App\Models\PinVerificationLog;
use App\Models\Guardian;
use App\Models\Role;
use App\Models\StaffProfile;
use App\Services\SubscriptionAccessService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private array $pinRoles = ['staff', 'teacher', 'daycare_admin', 'manager'];

    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['sometimes', 'string'],
            'organization_id' => ['sometimes', 'nullable', 'exists:organizations,id'],
        ]);

        $user = User::create($data);
        $role = Role::firstOrCreate(
            ['name' => $user->role],
            ['label' => str($user->role)->replace('_', ' ')->title()]
        );
        $user->roles()->sync([$role->id]);

        return response()->json([
            'user' => $user,
            'token' => $user->createToken('barbaari-api')->plainTextToken,
        ], 201);
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
        }

        if ($user->status !== 'active') {
            return response()->json(['message' => 'User is not active.'], 403);
        }

        return response()->json([
            'user' => $user->load('organization'),
            'token' => $user->createToken('barbaari-api')->plainTextToken,
        ]);
    }

    public function me(Request $request)
    {
        return response()->json(['user' => $request->user()->load('organization', 'staffProfile.classroom')]);
    }

    public function logout(Request $request)
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function verifyPin(Request $request)
    {
        $data = $request->validate([
            'pin' => ['required', 'digits_between:4,8'],
            'purpose' => ['sometimes', 'string', 'max:80'],
        ]);

        $user = $request->user();
        if (! in_array($user->role, $this->pinRoles, true)) {
            return response()->json(['message' => 'Only staff, teacher, daycare admin, or manager accounts can verify an attendance PIN.'], 403);
        }

        return $this->attemptPin($request, $user, $data['pin'], $data['purpose'] ?? 'staff_quick_access');
    }

    public function pinLogin(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'pin' => ['required', 'digits_between:4,8'],
            'purpose' => ['sometimes', 'string', 'max:80'],
        ]);

        $user = User::where('email', $data['email'])->first();
        if (! $user) {
            PinVerificationLog::create(['email' => $data['email'], 'success' => false, 'purpose' => $data['purpose'] ?? 'staff_quick_access', 'failure_reason' => 'user_not_found', 'ip_address' => $request->ip()]);
            throw ValidationException::withMessages(['pin' => ['PIN could not be verified.']]);
        }

        if (! in_array($user->role, $this->pinRoles, true)) {
            return response()->json(['message' => 'Only staff, teacher, daycare admin, or manager accounts can use attendance PIN login.'], 403);
        }
        $response = $this->attemptPin($request, $user, $data['pin'], $data['purpose'] ?? 'staff_quick_access')->getData(true);

        return response()->json([
            'user' => $user->load('organization', 'staffProfile.classroom'),
            'token' => $user->createToken('barbaari-pin')->plainTextToken,
            'pin_verification_id' => $response['pin_verification_id'],
            'verified_at' => $response['verified_at'],
        ]);
    }

    public function tabletUnlock(Request $request)
    {
        $data = $request->validate([
            'mode' => ['nullable', 'in:guardian,staff,admin'],
            'email' => ['required', 'email'],
            'pin' => ['nullable', 'digits_between:4,8'],
            'password_or_pin' => ['nullable', 'string'],
            'purpose' => ['sometimes', 'string', 'max:80'],
        ]);

        $user = User::where('email', $data['email'])->first();
        if (! $user) {
            PinVerificationLog::create(['email' => $data['email'], 'success' => false, 'purpose' => $data['purpose'] ?? 'tablet_attendance', 'failure_reason' => 'user_not_found', 'ip_address' => $request->ip()]);
            throw ValidationException::withMessages(['email' => ['Tablet unlock credentials were not accepted.']]);
        }

        if ($user->role === 'super_admin') {
            return response()->json(['message' => 'Super admin cannot unlock daily attendance tablet mode.'], 403);
        }
        if ($user->role === 'parent') {
            return response()->json(['message' => 'Parents and guardians do not unlock tablet mode. Ask provider staff to open the tablet and select you as the signer.'], 403);
        }
        if (! $user->organization_id || ! $user->organization) {
            return response()->json(['message' => 'This account is not linked to an active provider organization.'], 403);
        }
        if ($user->organization->status !== 'active') {
            return response()->json(['message' => 'This organization is not subscribed/active. Please contact the administrator.'], 402);
        }
        $subscriptionGate = app(SubscriptionAccessService::class)->getPaymentGateReason((int) $user->organization_id);
        if ($subscriptionGate['requires_payment']) {
            return response()->json([
                'message' => 'This organization is not subscribed/active. Please contact the administrator.',
                'requires_payment' => true,
                'subscription_status' => $subscriptionGate['subscription_status'],
            ], 402);
        }
        $mode = $data['mode'] ?? $this->tabletModeForUser($user);
        if ($mode === 'guardian') {
            return response()->json(['message' => 'Parents and guardians do not unlock tablet mode. Ask provider staff to open the tablet and select you as the signer.'], 403);
        } elseif ($mode === 'staff') {
            if ($user->status !== 'active') {
                return response()->json(['message' => 'This staff account is inactive.'], 403);
            }
            if (! in_array($user->role, ['staff', 'teacher'], true)) {
                return response()->json(['message' => 'Only staff or teacher accounts can unlock staff mode.'], 403);
            }
            $credential = $data['pin'] ?? $data['password_or_pin'] ?? '';
            if (! $user->pin_hash || ! Hash::check($credential, $user->pin_hash)) {
                $this->pinLog($request, $user, false, $data['purpose'] ?? 'tablet_staff', $user->pin_hash ? 'invalid_pin' : 'pin_not_set');
                throw ValidationException::withMessages(['pin' => [$user->pin_hash ? 'Incorrect staff PIN.' : 'No staff PIN is set. Reset it from Staff Access.']]);
            }
        } elseif ($mode === 'admin') {
            if ($user->status !== 'active') {
                return response()->json(['message' => 'This account is inactive.'], 403);
            }
            if (! in_array($user->role, ['daycare_admin', 'manager'], true)) {
                return response()->json(['message' => 'Only daycare admin or manager accounts can unlock admin mode.'], 403);
            }
            $credential = $data['password_or_pin'] ?? $data['pin'] ?? null;
            $passwordOk = $credential && Hash::check($credential, $user->password);
            $pinOk = $credential && $user->pin_hash && Hash::check($credential, $user->pin_hash);
            if (! $passwordOk && ! $pinOk) {
                $this->pinLog($request, $user, false, $data['purpose'] ?? 'tablet_admin', $user->pin_hash ? 'invalid_admin_credential' : 'pin_not_set');
                throw ValidationException::withMessages(['pin' => [$user->pin_hash ? 'Incorrect admin/manager PIN or password.' : 'Use the admin password, or reset an admin/manager tablet PIN from Staff Access.']]);
            }
        }

        $user->forceFill(['pin_failed_attempts' => 0, 'pin_locked_until' => null])->save();
        $log = $this->pinLog($request, $user, true, $data['purpose'] ?? 'tablet_'.$mode, null);
        $timezone = $this->attendanceTimezone((int) $user->organization_id);
        $visible = $this->tabletVisibility($user, $mode);

        return response()->json([
            'user' => $user->load('organization', 'staffProfile.classroom'),
            'role' => $user->role,
            'mode' => $mode,
            'organization_id' => $user->organization_id,
            'token' => $user->createToken('barbaari-tablet')->plainTextToken,
            'pin_verification_id' => $log->id,
            'verified_at' => optional($log->verified_at)->toDateTimeString(),
            'allowed_modes' => [$mode],
            'visible_classroom_ids' => $visible['classroom_ids'],
            'visible_child_ids' => $visible['child_ids'],
            'timezone' => $timezone,
            'permissions' => $visible['permissions'],
            'tablet_permissions' => $visible['permissions'],
        ]);
    }

    public function otp(Request $request)
    {
        $request->validate(['email' => ['required', 'email'], 'code' => ['nullable', 'string']]);

        return response()->json(['message' => 'OTP placeholder accepted for local development.']);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => ['required', 'email']]);

        $status = Password::sendResetLink(
            $request->only('email'),
            function (User $user, string $token) {
                $resetUrl = rtrim($this->passwordResetFrontendUrl($user), '/')
                    .'/reset-password?token='.$token.'&email='.urlencode($user->email);

                Mail::queue('emails.password-reset', ['resetUrl' => $resetUrl], function ($message) use ($user) {
                    $message->to($user->email)->subject('Reset your Barbaari password');
                });
            }
        );

        return response()->json(['message' => 'If an account exists for that email, a password reset link has been sent.']);
    }

    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
                event(new PasswordReset($user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Password has been reset. You can now log in.']);
        }

        if ($status === Password::INVALID_TOKEN) {
            return response()->json(['message' => 'This reset link is invalid or has expired. Please request a new one.'], 422);
        }

        return response()->json(['message' => 'Unable to reset password. Please try again.'], 422);
    }

    public function passwordResetSmoke(Request $request)
    {
        abort_unless($request->user()?->hasAnyRole(['super_admin', 'support_staff']), 403);

        $data = $request->validate([
            'email' => ['required', 'email', 'exists:users,email'],
        ]);

        $status = Password::sendResetLink(
            ['email' => $data['email']],
            function (User $user, string $token) {
                $resetUrl = rtrim($this->passwordResetFrontendUrl($user), '/')
                    .'/reset-password?token='.$token.'&email='.urlencode($user->email);

                Mail::queue('emails.password-reset', ['resetUrl' => $resetUrl], function ($message) use ($user) {
                    $message->to($user->email)->subject('Reset your Barbaari password');
                });
            }
        );

        return response()->json([
            'message' => $status === Password::RESET_LINK_SENT ? 'Password reset email queued.' : 'Password reset email could not be queued.',
            'status' => $status,
            'token_exists' => DB::table('password_reset_tokens')->where('email', $data['email'])->exists(),
        ], $status === Password::RESET_LINK_SENT ? 200 : 422);
    }

    public function showInvitation(string $token)
    {
        $invitation = OrganizationInvitation::with('organization')->where('token', $token)->first();
        if (! $invitation) {
            return response()->json(['message' => 'This invitation link is invalid. Please ask the daycare administrator for a new invite.'], 404);
        }
        if ($invitation->status === 'pending' && $invitation->expires_at && $invitation->expires_at->isPast()) {
            $invitation->update(['status' => 'expired']);
            $invitation->refresh();
        }

        return response()->json(['invitation' => $this->invitationPayload($invitation)]);
    }

    private function passwordResetFrontendUrl(User $user): string
    {
        if ($user->hasAnyRole(['super_admin', 'support_staff'])) {
            return config('app.super_admin_web_url', 'http://localhost:5174');
        }

        return config('app.daycare_web_url', config('app.frontend_url', 'http://localhost:5173'));
    }

    public function acceptInvitation(Request $request, string $token)
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);
        $invitation = OrganizationInvitation::with('organization')->where('token', $token)->first();
        if (! $invitation) {
            return response()->json(['message' => 'This invitation link is invalid. Please ask the daycare administrator for a new invite.'], 404);
        }
        if ($invitation->status !== 'pending') {
            return response()->json(['message' => 'This invitation is no longer available.'], 422);
        }
        if ($invitation->expires_at && $invitation->expires_at->isPast()) {
            $invitation->update(['status' => 'expired']);
            return response()->json(['message' => 'This invitation has expired.'], 422);
        }
        $user = $invitation->user ?: User::where('email', $invitation->email)->first();
        if ($user && ((int) $user->organization_id !== (int) $invitation->organization_id || $user->email !== $invitation->email)) {
            return response()->json(['message' => 'This invitation does not match the existing account.'], 422);
        }

        if ($user) {
            $user->update([
                'name' => $user->name ?: $invitation->name,
                'role' => $invitation->role,
                'status' => 'active',
                'password' => Hash::make($data['password']),
                'email_verified_at' => now(),
                'remember_token' => Str::random(60),
            ]);
        } else {
            $user = User::create([
                'organization_id' => $invitation->organization_id,
                'name' => $invitation->name,
                'email' => $invitation->email,
                'role' => $invitation->role,
                'status' => 'active',
                'password' => Hash::make($data['password']),
                'email_verified_at' => now(),
            ]);
        }
        $role = Role::firstOrCreate(['name' => $user->role], ['label' => Str::of($user->role)->replace('_', ' ')->title()]);
        $user->roles()->sync([$role->id]);
        if (in_array($user->role, ['teacher', 'staff'], true)) {
            StaffProfile::firstOrCreate(['user_id' => $user->id], ['organization_id' => $user->organization_id, 'title' => Str::title(str_replace('_', ' ', $user->role))]);
        }
        if ($user->role === 'parent') {
            Guardian::where('organization_id', $user->organization_id)
                ->where('email', $user->email)
                ->update(['user_id' => $user->id, 'status' => 'active']);
            $guardianPin = Guardian::where('organization_id', $user->organization_id)->where('email', $user->email)->whereNotNull('pin_hash')->value('pin_hash');
            if ($guardianPin && ! $user->pin_hash) {
                $user->update(['pin_hash' => $guardianPin, 'pin_failed_attempts' => 0, 'pin_locked_until' => null]);
            }
        }

        $invitation->update(['user_id' => $user->id, 'status' => 'accepted', 'accepted_at' => now()]);
        $subscription = Subscription::with('pricingPlan')->where('organization_id', $invitation->organization_id)->latest()->first();
        if ($subscription && $subscription->status === 'pending_activation') {
            $subscription->update(['status' => 'pending_payment']);
            $subscription->refresh();
            $this->ensureSubscriptionInvoice($subscription);
        }

        return response()->json([
            'message' => 'Invitation accepted. You can now log in.',
            'user' => $user->load('organization'),
        ]);
    }

    private function attemptPin(Request $request, User $user, string $pin, string $purpose)
    {
        if ($user->status !== 'active') {
            return response()->json(['message' => 'This staff account is inactive.'], 403);
        }

        if ($user->pin_locked_until && $user->pin_locked_until->isFuture()) {
            $log = $this->pinLog($request, $user, false, $purpose, 'locked');
            return response()->json(['message' => 'PIN is temporarily locked. Please try again later.', 'pin_verification_id' => $log->id], 423);
        }

        if (! $user->pin_hash) {
            $this->pinLog($request, $user, false, $purpose, 'pin_not_set');
            throw ValidationException::withMessages(['pin' => ['No staff PIN is set. Reset it from Staff Access.']]);
        }

        if (! Hash::check($pin, $user->pin_hash)) {
            $attempts = (int) $user->pin_failed_attempts + 1;
            $user->forceFill([
                'pin_failed_attempts' => $attempts,
                'pin_locked_until' => $attempts >= 5 ? now()->addMinutes(5) : null,
            ])->save();
            $this->pinLog($request, $user, false, $purpose, 'invalid_pin');
            throw ValidationException::withMessages(['pin' => ['Incorrect staff PIN.']]);
        }

        $user->forceFill(['pin_failed_attempts' => 0, 'pin_locked_until' => null])->save();
        $log = $this->pinLog($request, $user, true, $purpose, null);

        return response()->json([
            'message' => 'PIN verified.',
            'pin_verification_id' => $log->id,
            'verified_at' => optional($log->verified_at)->toDateTimeString(),
        ]);
    }

    private function pinLog(Request $request, User $user, bool $success, string $purpose, ?string $failureReason): PinVerificationLog
    {
        return PinVerificationLog::create([
            'user_id' => $user->id,
            'organization_id' => $user->organization_id,
            'email' => $user->email,
            'success' => $success,
            'purpose' => $purpose,
            'failure_reason' => $failureReason,
            'ip_address' => $request->ip(),
            'verified_at' => $success ? now() : null,
        ]);
    }

    private function invitationPayload(OrganizationInvitation $invitation): array
    {
        return [
            'organization_name' => $invitation->organization?->name,
            'email' => $invitation->email,
            'name' => $invitation->name,
            'role' => $invitation->role,
            'status' => $invitation->status,
            'expires_at' => optional($invitation->expires_at)->toDateTimeString(),
        ];
    }

    private function attendanceTimezone(int $organizationId): string
    {
        $settings = OrganizationSetting::where('organization_id', $organizationId)->first();
        $configured = $settings?->attendance_policy['attendance_timezone'] ?? $settings?->attendance_policy['timezone'] ?? null;
        if (is_string($configured) && in_array($configured, timezone_identifiers_list(), true)) {
            return $configured;
        }

        return 'Africa/Nairobi';
    }

    private function tabletVisibility(User $user, string $mode): array
    {
        $childQuery = \App\Models\Child::query()->where('organization_id', $user->organization_id);

        if ($mode === 'guardian') {
            $guardianIds = Guardian::where('organization_id', $user->organization_id)
                ->where('user_id', $user->id)
                ->where('status', 'active')
                ->pluck('id');
            $childQuery->whereHas('guardians', fn ($query) => $query->whereIn('guardians.id', $guardianIds));
        } elseif ($mode === 'staff') {
            $childQuery->where('classroom_id', $user->staffProfile?->classroom_id);
            if (($user->organization?->facility_type ?? 'center_daycare') === 'family_child_care') {
                $childQuery = \App\Models\Child::query()->where('organization_id', $user->organization_id);
            }
        }

        $children = $childQuery->get(['id', 'classroom_id']);

        return [
            'child_ids' => $children->pluck('id')->map(fn ($id) => (string) $id)->values(),
            'classroom_ids' => $children->pluck('classroom_id')->filter()->unique()->map(fn ($id) => (string) $id)->values(),
            'permissions' => [
                'can_view_all_children' => $mode === 'admin',
                'can_view_all_classrooms' => $mode === 'admin',
                'can_staff_assist' => in_array($mode, ['staff', 'admin'], true),
                'can_admin_settings' => $mode === 'admin',
                'mode' => $mode,
            ],
        ];
    }

    private function tabletModeForUser(User $user): string
    {
        if ($user->role === 'parent') {
            return 'guardian';
        }
        if (in_array($user->role, ['staff', 'teacher'], true)) {
            return 'staff';
        }

        return 'admin';
    }

    private function ensureSubscriptionInvoice(Subscription $subscription): void
    {
        $plan = $subscription->pricingPlan;
        if (! $plan) return;

        $amount = (float) $plan->monthly_price;
        if ($amount <= 0) return;

        $existing = PlatformInvoice::where('organization_id', $subscription->organization_id)
            ->whereIn('status', ['open', 'partial', 'overdue'])
            ->first();

        if ($existing) return;

        PlatformInvoice::create([
            'organization_id' => $subscription->organization_id,
            'subscription_id' => $subscription->id,
            'invoice_number' => 'PLAT-'.now()->format('YmdHis').'-'.Str::upper(Str::random(4)),
            'billing_period_start' => now()->toDateString(),
            'billing_period_end' => optional($subscription->current_period_end)->toDateString() ?? now()->addMonth()->toDateString(),
            'due_date' => now()->addDays(7)->toDateString(),
            'currency' => $plan->currency ?? 'USD',
            'subtotal' => $amount,
            'total_amount' => $amount,
            'balance_due' => $amount,
            'status' => 'open',
            'payment_method' => 'manual',
            'notes' => $plan->name.' Plan - Monthly Subscription',
        ]);
    }
}
