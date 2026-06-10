<?php

namespace App\Http\Controllers;

use App\Models\AttendanceAuditLog;
use App\Models\AttendanceCorrection;
use App\Models\AttendanceRecord;
use App\Models\AbsenceRecord;
use App\Models\AuditLog;
use App\Models\Child;
use App\Models\Classroom;
use App\Models\Conversation;
use App\Models\DailyChildNote;
use App\Models\Device;
use App\Models\Document;
use App\Models\FacilityRegistrationApplication;
use App\Models\Guardian;
use App\Models\IncidentReport;
use App\Models\Invoice;
use App\Models\Message;
use App\Models\Notification;
use App\Models\Organization;
use App\Models\OrganizationInvitation;
use App\Models\OrganizationSetting;
use App\Models\PinVerificationLog;
use App\Models\PlatformSetting;
use App\Models\PaymentProviderEvent;
use App\Models\PlatformInvoice;
use App\Models\PlatformPayment;
use App\Models\PricingPlan;
use App\Models\Role;
use App\Models\StaffProfile;
use App\Models\Subscription;
use App\Models\SupportTicket;
use App\Models\SupportTicketComment;
use App\Models\SystemAlert;
use App\Models\User;
use App\Mail\OrganizationInvitationMail;
use App\Mail\PlatformInvoiceMail;
use App\Mail\SubscriptionActivatedMail;
use App\Services\NotificationService;
use App\Services\StripeService;
use App\Services\SubscriptionAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ApiController extends Controller
{
    private array $managerRoles = ['daycare_admin', 'manager'];
    private array $staffRoles = ['staff', 'teacher'];

    public function __construct(
        private NotificationService $notifications,
        private StripeService $stripe,
        private SubscriptionAccessService $subscriptionAccess,
    ) {
    }

    public function managerDashboard(Request $request)
    {
        $orgId = $this->orgId($request);
        $today = now()->toDateString();

        return response()->json([
            'metrics' => [
                ['label' => 'Children', 'value' => (string) Child::where('organization_id', $orgId)->count(), 'detail' => 'Active enrollment', 'tone' => 'primary'],
                ['label' => 'Present today', 'value' => (string) AttendanceRecord::where('organization_id', $orgId)->whereDate('date', $today)->whereNull('check_out_time')->count(), 'detail' => 'Currently checked in', 'tone' => 'secondary'],
                ['label' => 'Open invoices', 'value' => '$'.number_format((float) Invoice::where('organization_id', $orgId)->whereIn('status', ['open', 'overdue'])->sum('amount'), 2), 'detail' => 'Unpaid balance', 'tone' => 'tertiary'],
                ['label' => 'Incidents', 'value' => (string) IncidentReport::where('organization_id', $orgId)->whereIn('status', ['draft', 'sent'])->count(), 'detail' => 'Open reports', 'tone' => 'danger'],
            ],
            'attendanceTrend' => $this->attendanceTrend($orgId),
            'revenueTrend' => [['month' => now()->format('M'), 'revenue' => (float) Invoice::where('organization_id', $orgId)->sum('amount')]],
        ]);
    }

    public function publicPricingPlans(Request $request)
    {
        $facilityType = $request->string('facility_type')->toString();
        $query = PricingPlan::where('status', 'active');
        if ($facilityType === 'family_child_care') {
            $query->where('available_for_family_child_care', true)
                ->where(function ($planQuery) {
                    $planQuery->whereRaw('LOWER(code) = ?', ['starter'])
                        ->orWhereRaw('LOWER(name) = ?', ['starter']);
                });
        } elseif ($facilityType === 'center_daycare') {
            $query->where('available_for_center_daycare', true);
        }

        return response()->json(['pricing_plans' => $query->orderBy('monthly_price')->get()->map(fn (PricingPlan $plan) => $this->pricingPlanPayload($plan))]);
    }

    public function createFacilityRegistrationApplication(Request $request)
    {
        $data = $request->validate([
            'facility_type' => ['required', 'in:family_child_care,center_daycare'],
            'business_name' => ['required', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'owner_name' => ['required', 'string', 'max:255'],
            'owner_email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:80'],
            'city' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'attendance_radius_meters' => ['nullable', 'integer', 'min:25', 'max:5000'],
            'timezone' => ['nullable', 'string', 'max:80'],
            'license_number' => ['nullable', 'string', 'max:255'],
            'license_status' => ['nullable', 'in:not_provided,pending,verified,rejected,expired'],
            'pricing_plan_id' => ['nullable', 'exists:pricing_plans,id'],
            'billing_cycle' => ['nullable', 'in:monthly,yearly'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ]);

        if (! empty($data['pricing_plan_id'])) {
            $plan = PricingPlan::findOrFail($data['pricing_plan_id']);
            $this->validateFacilityPlanSelection($data['facility_type'], $plan);
            abort_if(
                ($data['facility_type'] === 'family_child_care' && ! $plan->available_for_family_child_care)
                || ($data['facility_type'] === 'center_daycare' && ! $plan->available_for_center_daycare),
                422,
                'The selected plan is not available for this facility type.'
            );
        }

        $application = FacilityRegistrationApplication::create([
            ...$data,
            'billing_cycle' => $data['billing_cycle'] ?? 'monthly',
            'license_status' => ! empty($data['license_number']) ? ($data['license_status'] ?? 'pending') : ($data['license_status'] ?? 'not_provided'),
            'status' => 'pending',
        ]);

        return response()->json([
            'application' => $this->registrationApplicationPayload($application->fresh('pricingPlan')),
            'message' => 'Registration application received. Barbaari will review it before creating the provider workspace.',
        ], 201);
    }

    public function organization(Request $request)
    {
        $organization = Organization::with('settings')->findOrFail($this->orgId($request));
        $subscription = Subscription::with('pricingPlan')->where('organization_id', $organization->id)->latest()->first();

        return response()->json([
            'organization' => $organization->toArray() + [
                'timezone' => $organization->timezone ?: $this->attendanceTimezone($organization->id),
                'attendance_timezone' => $this->attendanceTimezone($organization->id),
                'subscription' => $subscription ? $this->subscriptionPayload($subscription) : null,
            ],
        ]);
    }

    public function updateOrganization(Request $request)
    {
        $organization = Organization::findOrFail($this->orgId($request));
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'website' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'max:120'],
            'timezone' => ['nullable', 'timezone'],
            'license_number' => ['nullable', 'string', 'max:255'],
            'license_status' => ['nullable', 'in:not_provided,pending,verified,rejected,expired'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'attendance_radius_meters' => ['nullable', 'integer', 'min:25', 'max:10000'],
            'checkin_radius_meters' => ['nullable', 'integer', 'min:25', 'max:10000'],
        ]);
        if (array_key_exists('attendance_radius_meters', $data)) {
            $data['checkin_radius_meters'] = $data['attendance_radius_meters'];
        } elseif (array_key_exists('checkin_radius_meters', $data)) {
            $data['attendance_radius_meters'] = $data['checkin_radius_meters'];
        }
        $organization->update($data);
        if (! empty($data['timezone'])) {
            $this->updateOrganizationTimezone($organization, $data['timezone']);
        }

        return response()->json(['organization' => $organization->fresh('settings')]);
    }

    public function children(Request $request)
    {
        return response()->json(['children' => $this->visibleChildren($request)->with('classroom', 'guardians')->get()->map(fn ($child) => $this->childPayload($child))]);
    }

    public function tabletBootstrap(Request $request)
    {
        $mode = $request->string('mode')->toString() ?: $this->tabletModeForUser($request->user());
        $timezone = $this->attendanceTimezone($this->orgId($request));
        $organization = $request->user()->organization;
        $facilityType = $organization?->facility_type ?? 'center_daycare';
        $childrenQuery = $this->tabletChildren($request, $mode);
        $children = $childrenQuery->with('classroom', 'guardians')->get();
        $childIds = $children->pluck('id');
        $classroomIds = $children->pluck('classroom_id')->filter()->unique()->values();
        $classrooms = Classroom::where('organization_id', $this->orgId($request))
            ->whereIn('id', $classroomIds)
            ->get()
            ->map(function (Classroom $classroom) use ($children) {
                $count = $children->where('classroom_id', $classroom->id)->count();

                return [
                    'id' => (string) $classroom->id,
                    'name' => $classroom->name,
                    'capacity' => $classroom->capacity,
                    'children_count' => $count,
                    'childrenCount' => $count,
                ];
            })
            ->values();
        $today = Carbon::now($timezone)->toDateString();

        return response()->json([
            'user' => $request->user()->load('organization', 'staffProfile.classroom'),
            'mode' => $mode,
            'facility_type' => $facilityType,
            'facilityType' => $facilityType,
            'uses_classrooms' => $facilityType === 'center_daycare',
            'scope' => $this->tabletScope($request, $mode),
            'scopeLabel' => $this->tabletScopeLabel($request, $mode),
            'timezone' => $timezone,
            'localDate' => $today,
            'classrooms' => $classrooms,
            'children' => $children->map(fn (Child $child) => $this->childPayload($child))->values(),
            'attendance' => AttendanceRecord::with('child.classroom', 'classroom')
                ->whereIn('child_id', $childIds)
                ->whereDate('date', $today)
                ->latest('check_in_time')
                ->get()
                ->map(fn (AttendanceRecord $record) => $this->attendancePayload($record))
                ->values(),
            'absences' => AbsenceRecord::with('child.classroom', 'classroom', 'enteredBy')
                ->whereIn('child_id', $childIds)
                ->whereDate('absence_date', $today)
                ->latest()
                ->get()
                ->map(fn (AbsenceRecord $absence) => $this->absencePayload($absence))
                ->values(),
            'guardians' => Guardian::where('organization_id', $this->orgId($request))
                ->whereHas('children', fn ($query) => $query->whereIn('children.id', $childIds))
                ->get(),
            'staff' => $this->tabletStaff($request, $mode)
                ->map(fn (StaffProfile $profile) => [
                    'id' => (string) $profile->user_id,
                    'name' => $profile->user?->name,
                    'role' => $profile->user?->role,
                    'status' => $profile->user?->status,
                    'classroomId' => $profile->classroom_id,
                    'classroom' => $profile->classroom?->name,
                    'title' => $profile->title,
                ])
                ->values(),
        ]);
    }

    private function tabletStaff(Request $request, string $mode)
    {
        if ($mode === 'guardian') {
            return collect();
        }

        $query = StaffProfile::with('user', 'classroom')
                ->where('organization_id', $this->orgId($request))
                ->whereHas('user', fn ($userQuery) => $userQuery->where('status', 'active'));

        if ($mode === 'staff' && in_array($request->user()->role, $this->staffRoles, true)) {
            $query->where('user_id', $request->user()->id);
        }

        return $query->get();
    }

    public function createChild(Request $request)
    {
        $data = $request->validate([
            'first_name' => ['required', 'string'],
            'last_name' => ['required', 'string'],
            'date_of_birth' => ['nullable', 'date'],
            'classroom_id' => ['nullable', 'exists:classrooms,id'],
            'child_code' => ['nullable', 'string', 'max:50'],
            'allergies' => ['nullable', 'array'],
        ]);
        $data['organization_id'] = $this->orgId($request);
        $data['child_code'] = $data['child_code'] ?? $this->generateChildCode($data['organization_id']);
        abort_if(
            Child::where('organization_id', $data['organization_id'])->where('child_code', $data['child_code'])->exists(),
            422,
            'That child code is already in use for this organization.'
        );

        return response()->json(['child' => $this->childPayload(Child::create($data)->load('classroom', 'guardians'))], 201);
    }

    public function updateChild(Request $request, Child $child)
    {
        $this->authorizeChild($request, $child);
        $data = $request->validate([
            'first_name' => ['sometimes', 'string'],
            'last_name' => ['sometimes', 'string'],
            'date_of_birth' => ['sometimes', 'nullable', 'date'],
            'classroom_id' => ['sometimes', 'nullable', 'exists:classrooms,id'],
            'allergies' => ['sometimes', 'array'],
            'status' => ['sometimes', 'string'],
        ]);
        $child->update($data);

        return response()->json(['child' => $this->childPayload($child->fresh(['classroom', 'guardians']))]);
    }

    public function deleteChild(Request $request, Child $child)
    {
        $this->authorizeChild($request, $child);
        $child->delete();

        return response()->json(['message' => 'Child deleted.']);
    }

    public function showChild(Request $request, Child $child)
    {
        $this->authorizeChild($request, $child);

        return response()->json(['child' => $this->childPayload($child->load('classroom', 'guardians', 'attendanceRecords', 'invoices', 'incidentReports'))]);
    }

    public function assignClassroom(Request $request, Child $child)
    {
        $this->authorizeChild($request, $child);
        $data = $request->validate(['classroom_id' => ['required', 'exists:classrooms,id']]);
        $child->update($data);

        return response()->json(['child' => $this->childPayload($child->fresh(['classroom', 'guardians']))]);
    }

    public function linkGuardian(Request $request, Child $child)
    {
        $this->authorizeChild($request, $child);
        $data = $request->validate([
            'guardian_id' => ['required', 'exists:guardians,id'],
            'primary_contact' => ['sometimes', 'boolean'],
            'pickup_authorized' => ['sometimes', 'boolean'],
        ]);
        $child->guardians()->syncWithoutDetaching([$data['guardian_id'] => [
            'primary_contact' => $data['primary_contact'] ?? false,
            'pickup_authorized' => $data['pickup_authorized'] ?? true,
        ]]);

        return response()->json(['child' => $this->childPayload($child->fresh(['classroom', 'guardians']))]);
    }

    public function guardians(Request $request)
    {
        $query = Guardian::with('children', 'user')->where('organization_id', $this->orgId($request));
        return response()->json(['guardians' => $query->get()->map(fn (Guardian $guardian) => $this->guardianPayload($guardian))]);
    }

    public function createGuardian(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:80'],
            'relationship' => ['nullable', 'string', 'max:120'],
            'can_pickup' => ['sometimes', 'boolean'],
            'child_id' => ['nullable', 'exists:children,id'],
            'send_invite' => ['sometimes', 'boolean'],
            'pin' => ['nullable', 'regex:/^\d{4,8}$/'],
        ]);
        $orgId = $this->orgId($request);
        $child = ! empty($data['child_id']) ? Child::where('organization_id', $orgId)->findOrFail($data['child_id']) : null;

        $guardian = Guardian::create([
            'organization_id' => $orgId,
            'user_id' => null,
            'name' => $data['name'],
            'email' => null,
            'phone' => $data['phone'] ?? null,
            'relationship' => $data['relationship'] ?? null,
            'can_pickup' => $data['can_pickup'] ?? true,
            'status' => 'active',
            'pin_hash' => ! empty($data['pin']) ? Hash::make($data['pin']) : null,
        ]);

        if ($child) {
            $child->guardians()->syncWithoutDetaching([$guardian->id => ['primary_contact' => false, 'pickup_authorized' => $guardian->can_pickup]]);
        }

        $this->platformAudit($request, 'guardian.created', $guardian, ['child_id' => $child?->id]);

        return response()->json([
            'guardian' => $guardian->fresh('children'),
            'invitation' => null,
            'message' => 'Guardian created.',
        ], 201);
    }

    public function updateGuardian(Request $request, Guardian $guardian)
    {
        abort_unless($guardian->organization_id === $this->orgId($request), 403);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:80'],
            'relationship' => ['nullable', 'string', 'max:120'],
            'can_pickup' => ['sometimes', 'boolean'],
            'status' => ['sometimes', 'in:active,pending_invite,inactive'],
            'pin' => ['nullable', 'regex:/^\d{4,8}$/'],
        ]);
        $updates = collect($data)->except('pin')->all();
        unset($updates['email']);
        if (! empty($data['pin'])) {
            $updates['pin_hash'] = Hash::make($data['pin']);
        }
        $guardian->update($updates);

        return response()->json(['guardian' => $guardian->fresh('children', 'user')]);
    }

    public function sendGuardianInvite(Request $request, Guardian $guardian)
    {
        abort_unless($guardian->organization_id === $this->orgId($request), 403);
        return response()->json(['message' => 'Guardian email invitations are no longer used. Guardians sign attendance with their tablet PIN.'], 410);
    }

    public function sendGuardianPasswordReset(Request $request, Guardian $guardian)
    {
        abort_unless($guardian->organization_id === $this->orgId($request), 403);
        return response()->json(['message' => 'Guardian password reset is no longer used. Guardians sign attendance with their tablet PIN.'], 410);
    }

    public function resetGuardianPin(Request $request, Guardian $guardian)
    {
        abort_unless($guardian->organization_id === $this->orgId($request), 403);
        $data = $request->validate(['pin' => ['required', 'regex:/^\d{4,8}$/']]);
        $hash = Hash::make($data['pin']);
        $guardian->update(['pin_hash' => $hash]);
        $this->platformAudit($request, 'guardian.pin_reset', $guardian);

        $fresh = $guardian->fresh('user', 'children');
        $ready = $fresh->status === 'active' && (bool) $fresh->pin_hash;

        return response()->json([
            'guardian' => $this->guardianPayload($fresh),
            'tablet_unlock_ready' => $ready,
            'message' => $ready
                ? 'Guardian tablet PIN reset. Tablet signer verification is ready.'
                : 'Guardian tablet PIN reset.',
        ]);
    }

    public function attendance(Request $request)
    {
        $query = AttendanceRecord::with('child.classroom', 'classroom')
            ->whereIn('child_id', $this->visibleChildren($request)->pluck('id'));

        if ($request->filled('date')) {
            $query->whereDate('date', $request->string('date'));
        }
        if ($request->filled('classroom_id')) {
            $query->where('classroom_id', $request->integer('classroom_id'));
        }
        if ($request->filled('child_id')) {
            $query->where('child_id', $request->integer('child_id'));
        }

        return response()->json(['attendance' => $query->latest('date')->latest('check_in_time')->get()->map(fn ($record) => $this->attendancePayload($record))]);
    }

    public function attendanceHistory(Request $request)
    {
        return $this->attendance($request);
    }

    public function absenceRecords(Request $request)
    {
        $query = AbsenceRecord::with('child.classroom', 'classroom', 'enteredBy')
            ->where('organization_id', $this->orgId($request))
            ->whereIn('child_id', $this->visibleChildren($request)->pluck('id'));

        if ($request->filled('date')) {
            $query->whereDate('absence_date', $request->string('date'));
        }
        if ($request->filled('from')) {
            $query->whereDate('absence_date', '>=', $request->string('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('absence_date', '<=', $request->string('to'));
        }
        if ($request->filled('child_id')) {
            $query->where('child_id', $request->integer('child_id'));
        }
        if ($request->filled('classroom_id')) {
            $query->where('classroom_id', $request->integer('classroom_id'));
        }
        if ($request->filled('absence_type')) {
            $query->where('absence_type', $request->string('absence_type'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        return response()->json(['absence_records' => $query->latest('absence_date')->latest()->get()->map(fn ($absence) => $this->absencePayload($absence))]);
    }

    public function createAbsenceRecord(Request $request)
    {
        return $this->storeAbsenceRecord($request);
    }

    public function tabletCreateAbsenceRecord(Request $request)
    {
        return $this->storeAbsenceRecord($request, true);
    }

    private function storeAbsenceRecord(Request $request, bool $tabletMode = false)
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'absence_date' => ['required_without:date', 'date'],
            'date' => ['required_without:absence_date', 'date'],
            'absence_type' => ['required', 'in:excused,unexcused,sick,vacation,no_show,other'],
            'reason' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'assisting_staff_id' => ['nullable', 'exists:users,id'],
            'signer_type' => ['nullable', 'in:guardian,parent,staff'],
            'guardian_id' => ['nullable', 'exists:guardians,id'],
            'signer_name' => ['nullable', 'string', 'max:255'],
            'verification_method' => ['nullable', 'in:pin'],
            'pin_verification_id' => ['nullable', 'exists:pin_verification_logs,id'],
            'signature_name' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'in:recorded,reviewed,cancelled'],
        ]);

        $child = Child::with('guardians')->findOrFail($data['child_id']);
        $tabletMode ? $this->authorizeTabletChild($request, $child) : $this->authorizeChild($request, $child);
        $this->authorizeAssistingStaff($request, $child, $data['assisting_staff_id'] ?? null);
        if ($tabletMode) {
            abort_unless(($data['verification_method'] ?? null) === 'pin', 422, 'Please verify the signer PIN before saving an absence.');
            abort_unless(! empty($data['pin_verification_id']), 422, 'Please verify the signer PIN before saving an absence.');
            abort_unless(! empty($data['signature_name']), 422, 'Please capture a signature before saving an absence.');
            $this->consumePinVerificationIfNeeded($request, $data);
        }

        $absence = AbsenceRecord::updateOrCreate(
            ['organization_id' => $child->organization_id, 'child_id' => $child->id, 'absence_date' => Carbon::parse($data['absence_date'] ?? $data['date'])->toDateString()],
            [
                'classroom_id' => $child->classroom_id,
                'absence_type' => $data['absence_type'],
                'reason' => $data['reason'] ?? null,
                'notes' => $data['notes'] ?? null,
                'status' => $data['status'] ?? 'recorded',
                'entered_by' => $request->user()->id,
                'assisting_staff_id' => $data['assisting_staff_id'] ?? null,
            ]
        );

        if ($absence->wasRecentlyCreated) {
            $this->notifications->notifyParentAbsenceRecorded($absence->load('child.guardians'), $request->user());
        }

        AuditLog::create([
            'organization_id' => $child->organization_id,
            'actor_id' => $request->user()->id,
            'action' => $absence->wasRecentlyCreated ? 'absence.created' : 'absence.updated',
            'target_type' => AbsenceRecord::class,
            'target_id' => $absence->id,
            'changes' => [
                'child_id' => $child->id,
                'absence_date' => optional($absence->absence_date)->toDateString(),
                'absence_type' => $absence->absence_type,
                'reason' => $absence->reason,
                'status' => $absence->status,
            ],
            'ip_address' => $request->ip(),
        ]);

        return response()->json(['absence_record' => $this->absencePayload($absence->fresh(['child.classroom', 'classroom', 'enteredBy', 'assistingStaff']))], $absence->wasRecentlyCreated ? 201 : 200);
    }

    public function showAbsenceRecord(Request $request, AbsenceRecord $absence)
    {
        $this->authorizeAbsence($request, $absence);

        return response()->json(['absence_record' => $this->absencePayload($absence->load('child.classroom', 'classroom', 'enteredBy', 'assistingStaff'))]);
    }

    public function updateAbsenceRecord(Request $request, AbsenceRecord $absence)
    {
        $this->authorizeAbsence($request, $absence, manage: true);

        $data = $request->validate([
            'absence_date' => ['sometimes', 'date'],
            'absence_type' => ['sometimes', 'in:excused,unexcused,sick,vacation,no_show,other'],
            'reason' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'status' => ['sometimes', 'in:recorded,reviewed,cancelled'],
        ]);

        if (isset($data['absence_date'])) {
            $data['absence_date'] = Carbon::parse($data['absence_date'])->toDateString();
        }

        $absence->update($data);

        return response()->json(['absence_record' => $this->absencePayload($absence->fresh(['child.classroom', 'classroom', 'enteredBy', 'assistingStaff']))]);
    }

    public function cancelAbsenceRecord(Request $request, AbsenceRecord $absence)
    {
        $this->authorizeAbsence($request, $absence, manage: true);
        $absence->update(['status' => 'cancelled']);

        return response()->json(['absence_record' => $this->absencePayload($absence->fresh(['child.classroom', 'classroom', 'enteredBy', 'assistingStaff']))]);
    }

    public function checkIn(Request $request)
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'signer_type' => ['required', 'in:guardian,staff,authorized_pickup'],
            'verification_method' => ['required', 'in:pin,qr,secure_login,digital_signature'],
            'pin_verification_id' => ['required_if:verification_method,pin', 'nullable', 'exists:pin_verification_logs,id'],
            'device_id' => ['nullable', 'exists:devices,id'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);
        $child = Child::findOrFail($data['child_id']);
        $this->authorizeChild($request, $child);
        $this->rejectUnavailableVerificationMethod($data);
        $this->consumePinVerificationIfNeeded($request, $data);
        $timezone = $this->attendanceTimezone($child->organization_id);
        $today = now();
        $localDate = Carbon::now($timezone)->toDateString();
        $locationData = $this->calculateLocationData($child->organization_id, $data['latitude'] ?? null, $data['longitude'] ?? null, 'check_in', $child, $request->user());

        $record = AttendanceRecord::firstOrCreate(
            ['child_id' => $child->id, 'date' => $localDate],
            array_merge([
                'organization_id' => $child->organization_id,
                'classroom_id' => $child->classroom_id,
                'check_in_time' => $today,
                'check_in_signed_by_user_id' => $request->user()->id,
                'signer_name' => $request->user()->name,
                'signer_type' => $data['signer_type'],
                'verification_method' => $data['verification_method'],
                'device_id' => $data['device_id'] ?? null,
            ], $locationData)
        );

        if (! $record->wasRecentlyCreated && ! $record->check_in_time) {
            $record->update(array_merge(['check_in_time' => $today, 'check_in_signed_by_user_id' => $request->user()->id], $locationData));
        }

        $this->attendanceAudit($record, 'check_in', null, $record->toArray(), 'Initial check-in', $request->user()->id);
        $this->notifications->notifyParentChildCheckedIn($child->loadMissing('guardians'), $record->fresh(), $request->user());
        return response()->json(['attendance' => $this->attendancePayload($record->fresh(['child.classroom', 'classroom']))], 201);
    }

    public function checkOut(Request $request)
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'signer_type' => ['required', 'in:guardian,staff,authorized_pickup'],
            'verification_method' => ['required', 'in:pin,qr,secure_login,digital_signature'],
            'pin_verification_id' => ['required_if:verification_method,pin', 'nullable', 'exists:pin_verification_logs,id'],
            'device_id' => ['nullable', 'exists:devices,id'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);
        $child = Child::findOrFail($data['child_id']);
        $this->authorizeChild($request, $child);
        $this->rejectUnavailableVerificationMethod($data);
        $this->consumePinVerificationIfNeeded($request, $data);
        $localDate = Carbon::now($this->attendanceTimezone($child->organization_id))->toDateString();
        $record = AttendanceRecord::where('child_id', $child->id)->whereDate('date', $localDate)->firstOrFail();
        $original = $record->toArray();
        $locationData = $this->calculateLocationData($child->organization_id, $data['latitude'] ?? null, $data['longitude'] ?? null, 'check_out', $child, $request->user());
        $record->update(array_merge([
            'check_out_time' => now(),
            'check_out_signed_by_user_id' => $request->user()->id,
            'signer_name' => $request->user()->name,
            'signer_type' => $data['signer_type'],
            'verification_method' => $data['verification_method'],
            'device_id' => $data['device_id'] ?? $record->device_id,
        ], $locationData));
        $this->attendanceAudit($record, 'check_out', $original, $record->fresh()->toArray(), 'Initial check-out', $request->user()->id);
        $this->notifications->notifyParentChildCheckedOut($child->loadMissing('guardians'), $record->fresh(), $request->user());
        return response()->json(['attendance' => $this->attendancePayload($record->fresh(['child.classroom', 'classroom']))]);
    }

    public function pickupSigners(Request $request, Child $child)
    {
        $this->authorizeChild($request, $child);

        return $this->pickupSignersResponse($child);
    }

    public function tabletPickupSigners(Request $request, Child $child)
    {
        $this->authorizeTabletChild($request, $child);

        return $this->pickupSignersResponse($child);
    }

    public function tabletChildSigners(Request $request, Child $child)
    {
        $this->authorizeTabletChild($request, $child);

        return response()->json(['signers' => $this->tabletSignerList($request, $child)]);
    }

    public function tabletVerifySignerPin(Request $request)
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'signer_type' => ['required', 'in:guardian,staff,admin'],
            'signer_id' => ['required', 'integer'],
            'pin' => ['required', 'digits_between:4,8'],
        ]);

        $child = Child::with('guardians', 'classroom')->findOrFail($data['child_id']);
        $this->authorizeTabletChild($request, $child);
        [$signerUser, $signer, $pinHash, $purpose] = $this->resolveTabletSigner($request, $child, $data['signer_type'], (int) $data['signer_id']);

        if (! $pinHash) {
            $this->recordSignerPinLog($request, $signerUser, $signer['email'] ?? null, false, 'pin_not_set', $purpose);
            throw ValidationException::withMessages(['pin' => ['This signer does not have a tablet PIN yet. Please set a PIN first.']]);
        }

        if (! Hash::check($data['pin'], $pinHash)) {
            $this->recordSignerPinLog($request, $signerUser, $signer['email'] ?? null, false, 'invalid_pin', $purpose);
            throw ValidationException::withMessages(['pin' => ['Incorrect signer PIN.']]);
        }

        $log = $this->recordSignerPinLog($request, $signerUser, $signer['email'] ?? null, true, null, $purpose);

        return response()->json([
            'message' => 'Signer PIN verified.',
            'pin_verification_id' => $log->id,
            'verified_at' => optional($log->verified_at)->toDateTimeString(),
            'signer' => $signer,
        ]);
    }

    private function pickupSignersResponse(Child $child)
    {
        $child->load('guardians');

        $guardians = $child->guardians->map(fn ($guardian) => [
            'id' => (string) $guardian->id,
            'type' => 'guardian',
            'name' => $guardian->name,
            'relationship' => $guardian->relationship,
            'phone' => $guardian->phone,
            'email' => null,
            'pin_configured' => (bool) $guardian->pin_hash,
            'can_pickup' => (bool) ($guardian->pivot?->pickup_authorized ?? $guardian->can_pickup),
        ])->values();

        $authorized = DB::table('pickup_authorizations')
            ->where('child_id', $child->id)
            ->where('active', true)
            ->where(fn ($query) => $query->whereNull('expires_on')->orWhereDate('expires_on', '>=', now()->toDateString()))
            ->get()
            ->map(fn ($pickup) => [
                'id' => (string) $pickup->id,
                'type' => 'authorized_pickup',
                'name' => $pickup->authorized_name,
                'relationship' => 'Authorized pickup',
                'phone' => $pickup->phone,
                'email' => null,
                'can_pickup' => true,
            ]);

        return response()->json(['signers' => $guardians->concat($authorized)->values()]);
    }

    private function tabletSignerList(Request $request, Child $child): \Illuminate\Support\Collection
    {
        $organization = $request->user()->organization;
        $facilityType = $organization?->facility_type ?? 'center_daycare';
        $child->load('guardians', 'classroom');

        $guardians = $child->guardians
            ->filter(fn (Guardian $guardian) => $guardian->status === 'active')
            ->map(fn (Guardian $guardian) => [
                'id' => (string) $guardian->id,
                'type' => 'guardian',
                'name' => $guardian->name,
                'relationship' => $guardian->relationship ?: 'Guardian',
                'email' => null,
                'pin_configured' => (bool) $guardian->pin_hash,
                'can_pickup' => (bool) ($guardian->pivot?->pickup_authorized ?? $guardian->can_pickup),
            ])
            ->values();

        if ($facilityType === 'family_child_care') {
            $owners = User::where('organization_id', $this->orgId($request))
                ->whereIn('role', $this->managerRoles)
                ->where('status', 'active')
                ->get()
                ->map(fn (User $user) => [
                    'id' => (string) $user->id,
                    'type' => 'admin',
                    'name' => $user->name,
                    'relationship' => $user->role === 'manager' ? 'Manager / owner' : 'Owner / admin',
                    'email' => $user->email,
                    'pin_configured' => (bool) $user->pin_hash,
                    'can_pickup' => true,
                ]);

            return $guardians->concat($owners)->values();
        }

        $staff = StaffProfile::with('user')
            ->where('organization_id', $this->orgId($request))
            ->where('classroom_id', $child->classroom_id)
            ->whereHas('user', fn ($query) => $query->whereIn('role', $this->staffRoles)->where('status', 'active'))
            ->get()
            ->map(fn (StaffProfile $profile) => [
                'id' => (string) $profile->user_id,
                'type' => 'staff',
                'name' => $profile->user?->name,
                'relationship' => $profile->user?->role === 'teacher' ? 'Classroom teacher' : 'Classroom staff',
                'email' => $profile->user?->email,
                'pin_configured' => (bool) $profile->user?->pin_hash,
                'can_pickup' => true,
            ]);

        return $guardians->concat($staff)->values();
    }

    private function resolveTabletSigner(Request $request, Child $child, string $type, int $id): array
    {
        if ($type === 'guardian') {
            $guardian = $child->guardians()
                ->where('guardians.id', $id)
                ->where('guardians.status', 'active')
                ->first();
            abort_unless($guardian, 403, 'This guardian is not linked to the selected child.');

            return [null, [
                'id' => (string) $guardian->id,
                'type' => 'guardian',
                'name' => $guardian->name,
                'relationship' => $guardian->relationship ?: 'Guardian',
                'email' => null,
                'pin_configured' => (bool) $guardian->pin_hash,
            ], $guardian->pin_hash, 'tablet_signer:guardian:'.$guardian->id];
        }

        $user = User::with('staffProfile')->where('organization_id', $this->orgId($request))->where('id', $id)->where('status', 'active')->first();
        abort_unless($user, 403, 'Selected signer is not active.');

        if ($type === 'staff') {
            abort_unless(in_array($user->role, $this->staffRoles, true), 403, 'Selected signer is not assigned staff.');
            abort_unless((int) $user->staffProfile?->classroom_id === (int) $child->classroom_id, 403, 'Selected staff can only sign for their assigned classroom.');
        } else {
            abort_unless(($request->user()->organization?->facility_type ?? 'center_daycare') === 'family_child_care', 403, 'Owner/admin signer is only available for family child care.');
            abort_unless(in_array($user->role, $this->managerRoles, true), 403, 'Selected signer must be the owner/admin.');
        }

        return [$user, [
            'id' => (string) $user->id,
            'type' => $type,
            'name' => $user->name,
            'relationship' => $type === 'staff' ? ($user->role === 'teacher' ? 'Classroom teacher' : 'Classroom staff') : ($user->role === 'manager' ? 'Manager / owner' : 'Owner / admin'),
            'email' => $user->email,
            'pin_configured' => (bool) $user->pin_hash,
        ], $user->pin_hash, 'tablet_signer:user:'.$user->id];
    }

    private function recordSignerPinLog(Request $request, ?User $user, ?string $email, bool $success, ?string $failureReason = null, string $purpose = 'tablet_signer'): PinVerificationLog
    {
        return PinVerificationLog::create([
            'user_id' => $user?->id,
            'organization_id' => $user?->organization_id ?? $this->orgId($request),
            'email' => $user?->email ?? $email,
            'success' => $success,
            'purpose' => $purpose,
            'failure_reason' => $failureReason,
            'ip_address' => $request->ip(),
            'verified_at' => $success ? now() : null,
        ]);
    }

    public function guardianCheckIn(Request $request)
    {
        return $this->signedAttendance($request, 'check_in');
    }

    public function guardianCheckOut(Request $request)
    {
        return $this->signedAttendance($request, 'check_out');
    }

    public function tabletGuardianCheckIn(Request $request)
    {
        return $this->signedAttendance($request, 'check_in', true);
    }

    public function tabletGuardianCheckOut(Request $request)
    {
        return $this->signedAttendance($request, 'check_out', true);
    }

    private function signedAttendance(Request $request, string $direction, bool $tabletMode = false)
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'signer_type' => ['required', 'in:guardian,parent,authorized_pickup,staff'],
            'guardian_id' => ['nullable', 'exists:guardians,id'],
            'pickup_authorization_id' => ['nullable', 'integer'],
            'assisting_staff_id' => ['nullable', 'exists:users,id'],
            'signer_name' => ['required', 'string', 'max:255'],
            'verification_method' => ['required', 'in:pin,qr,secure_login,digital_signature'],
            'signature_name' => ['nullable', 'string', 'max:255'],
            'signature_data' => ['nullable', 'string', 'max:350000'],
            'signature_reference' => ['nullable', 'string', 'max:120'],
            'pin_verification_id' => ['required_if:verification_method,pin', 'nullable', 'exists:pin_verification_logs,id'],
            'device_id' => ['nullable', 'exists:devices,id'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $child = Child::with('guardians')->findOrFail($data['child_id']);
        $tabletMode ? $this->authorizeTabletChild($request, $child) : $this->authorizeChild($request, $child);
        $this->authorizeAssistingStaff($request, $child, $data['assisting_staff_id'] ?? null);
        $this->rejectUnavailableVerificationMethod($data);

        [$guardianId, $pickupAuthorizationId, $signerName, $signerType] = $this->validatedAttendanceSigner($request, $child, $data);
        $this->consumePinVerificationIfNeeded($request, $data);
        if (($data['verification_method'] ?? null) === 'digital_signature') {
            abort_unless(! empty($data['signature_data']) || ! empty($data['signature_name']), 422, 'Please capture a signature before saving attendance.');
        }
        [$signatureReference, $signatureHash] = $this->storeAttendanceSignature($child, $signerName, $data);
        $signatureSource = $data['signature_data'] ?? $data['signature_name'] ?? $signerName;
        $signatureHash ??= hash('sha256', $child->id.'|'.$signerName.'|'.$signatureSource.'|'.now()->toISOString());

        $locationData = $this->calculateLocationData($child->organization_id, $data['latitude'] ?? null, $data['longitude'] ?? null, $direction, $child, $request->user());

        if ($direction === 'check_in') {
            $localDate = Carbon::now($this->attendanceTimezone($child->organization_id))->toDateString();
            $record = AttendanceRecord::firstOrCreate(
                ['child_id' => $child->id, 'date' => $localDate],
                array_merge([
                    'organization_id' => $child->organization_id,
                    'classroom_id' => $child->classroom_id,
                    'check_in_time' => now(),
                    'check_in_signed_by_user_id' => $request->user()->id,
                    'guardian_id' => $guardianId,
                    'pickup_authorization_id' => $pickupAuthorizationId,
                    'assisting_staff_id' => $data['assisting_staff_id'] ?? null,
                    'signer_name' => $signerName,
                    'signer_type' => $signerType,
                    'verification_method' => $data['verification_method'],
                    'device_id' => $data['device_id'] ?? null,
                    'signature_reference' => $signatureReference,
                    'signature_hash' => $signatureHash,
                ], $locationData)
            );
            $original = $record->wasRecentlyCreated ? null : $record->toArray();
            $record->update(array_merge([
                'check_in_time' => $record->check_in_time ?? now(),
                'check_in_signed_by_user_id' => $request->user()->id,
                'guardian_id' => $guardianId,
                'pickup_authorization_id' => $pickupAuthorizationId,
                'assisting_staff_id' => $data['assisting_staff_id'] ?? $record->assisting_staff_id,
                'signer_name' => $signerName,
                'signer_type' => $signerType,
                'verification_method' => $data['verification_method'],
                'device_id' => $data['device_id'] ?? $record->device_id,
                'signature_reference' => $signatureReference,
                'signature_hash' => $signatureHash,
            ], $locationData));
            $this->attendanceAudit($record->fresh(), 'guardian_check_in', $original, $record->fresh()->toArray(), 'Guardian/authorized pickup signed check-in', $request->user()->id);
            $this->notifications->notifyParentChildCheckedIn($child->loadMissing('guardians'), $record->fresh(), $request->user());
            return response()->json(['attendance' => $this->attendancePayload($record->fresh(['child.classroom', 'classroom', 'guardian']))], $record->wasRecentlyCreated ? 201 : 200);
        }

        $localDate = Carbon::now($this->attendanceTimezone($child->organization_id))->toDateString();
        $record = AttendanceRecord::where('child_id', $child->id)->whereDate('date', $localDate)->firstOrFail();
        $original = $record->toArray();
        $record->update(array_merge([
            'check_out_time' => now(),
            'check_out_signed_by_user_id' => $request->user()->id,
            'guardian_id' => $guardianId,
            'pickup_authorization_id' => $pickupAuthorizationId,
            'assisting_staff_id' => $data['assisting_staff_id'] ?? $record->assisting_staff_id,
            'signer_name' => $signerName,
            'signer_type' => $signerType,
            'verification_method' => $data['verification_method'],
            'device_id' => $data['device_id'] ?? $record->device_id,
            'signature_reference' => $signatureReference,
            'signature_hash' => $signatureHash,
        ], $locationData));
        $this->attendanceAudit($record, 'guardian_check_out', $original, $record->fresh()->toArray(), 'Guardian/authorized pickup signed check-out', $request->user()->id);
        $this->notifications->notifyParentChildCheckedOut($child->loadMissing('guardians'), $record->fresh(), $request->user());
        return response()->json(['attendance' => $this->attendancePayload($record->fresh(['child.classroom', 'classroom', 'guardian']))]);
    }

    public function correctAttendance(Request $request, AttendanceRecord $record)
    {
        abort_unless($record->organization_id === $this->orgId($request), 403);
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:5'],
            'check_in_time' => ['nullable', 'date', 'before_or_equal:now'],
            'check_out_time' => ['nullable', 'date', 'before_or_equal:now'],
        ]);
        $original = $record->only(['check_in_time', 'check_out_time']);
        $record->update([
            'check_in_time' => $data['check_in_time'] ?? $record->check_in_time,
            'check_out_time' => $data['check_out_time'] ?? $record->check_out_time,
            'corrected' => true,
        ]);
        $corrected = $record->fresh()->only(['check_in_time', 'check_out_time']);
        AttendanceCorrection::create(['attendance_record_id' => $record->id, 'original_value' => $original, 'corrected_value' => $corrected, 'reason' => $data['reason'], 'edited_by_user_id' => $request->user()->id]);
        $this->attendanceAudit($record, 'correction', $original, $corrected, $data['reason'], $request->user()->id);

        return response()->json(['attendance' => $this->attendancePayload($record->fresh(['child.classroom', 'classroom']))]);
    }

    public function attendanceAudits(Request $request)
    {
        $ids = AttendanceRecord::where('organization_id', $this->orgId($request))->pluck('id');
        $attendanceLogs = AttendanceAuditLog::with('attendanceRecord.child.classroom', 'attendanceRecord.child.organization', 'attendanceRecord.classroom', 'editedBy')
            ->whereIn('attendance_record_id', $ids)
            ->latest('edited_at')
            ->get()
            ->map(fn ($log) => $this->attendanceAuditPayload($log));
        $absenceLogs = AuditLog::with('actor')
            ->where('organization_id', $this->orgId($request))
            ->where('target_type', AbsenceRecord::class)
            ->latest()
            ->get()
            ->map(function (AuditLog $log) {
                $changes = $log->changes ?? [];
                $child = isset($changes['child_id']) ? Child::with('classroom', 'organization')->find($changes['child_id']) : null;
                $timezone = $log->organization_id ? $this->attendanceTimezone($log->organization_id) : 'Africa/Nairobi';
                $editedAtLocal = $log->created_at ? $log->created_at->copy()->timezone($timezone) : null;

                return [
                    'id' => 'absence-'.$log->id,
                    'attendance_record_id' => null,
                    'childName' => $child ? trim($child->first_name.' '.$child->last_name) : 'Absence record',
                    'childCode' => $child?->child_code,
                    'classroom' => $child?->classroom?->name ?? (($child?->organization?->facility_type ?? 'center_daycare') === 'family_child_care' ? 'Family child care' : null),
                    'date' => $changes['absence_date'] ?? null,
                    'action' => $log->action,
                    'reason' => trim(($changes['absence_type'] ?? 'absence').' '.($changes['reason'] ?? '')),
                    'edited_by_user_id' => $log->actor_id,
                    'editedBy' => $log->actor?->name,
                    'editedByEmail' => $log->actor?->email,
                    'edited_at' => optional($log->created_at)->toDateTimeString(),
                    'editedAtLocal' => optional($editedAtLocal)->toIso8601String(),
                    'timezone' => $timezone,
                ];
            });

        return response()->json(['audit_logs' => $attendanceLogs->concat($absenceLogs)->sortByDesc('edited_at')->values()]);
    }

    public function attendanceExport()
    {
        return response()->json(['message' => 'CSV/PDF export placeholder queued.']);
    }

    public function classrooms(Request $request)
    {
        return response()->json(['classrooms' => Classroom::withCount('children')->where('organization_id', $this->orgId($request))->get()]);
    }

    public function createClassroom(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'capacity' => ['sometimes', 'integer', 'min:1'],
            'lead_staff_id' => ['nullable', 'exists:users,id'],
        ]);
        $data['organization_id'] = $this->orgId($request);

        return response()->json(['classroom' => Classroom::create($data)->loadCount('children')], 201);
    }

    public function updateClassroom(Request $request, Classroom $classroom)
    {
        abort_unless($classroom->organization_id === $this->orgId($request), 403);
        $classroom->update($request->only(['name', 'capacity', 'lead_staff_id']));

        return response()->json(['classroom' => $classroom->fresh()->loadCount('children')]);
    }

    public function deleteClassroom(Request $request, Classroom $classroom)
    {
        abort_unless($classroom->organization_id === $this->orgId($request), 403);
        abort_if($classroom->children()->exists(), 422, 'Classroom has assigned children.');
        $classroom->delete();

        return response()->json(['message' => 'Classroom deleted.']);
    }

    public function users(Request $request)
    {
        return response()->json(['users' => User::with('organization', 'staffProfile.classroom')->where('organization_id', $this->orgId($request))->latest()->get()]);
    }

    public function createUser(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string'],
            'role' => ['required', 'in:daycare_admin,manager,staff,teacher,parent,billing_manager'],
            'classroom_id' => ['nullable', 'exists:classrooms,id'],
            'title' => ['nullable', 'string', 'max:120'],
            'pin' => ['nullable', 'string', 'min:4', 'max:8'],
            'send_invite' => ['sometimes', 'boolean'],
        ]);

        $user = User::create([
            'organization_id' => $this->orgId($request),
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role' => $data['role'],
            'status' => $request->boolean('send_invite', true) ? 'pending_invite' : 'active',
            'password' => Hash::make(Str::random(40)),
            'pin_hash' => ! empty($data['pin']) ? Hash::make($data['pin']) : null,
            'pin_failed_attempts' => 0,
            'pin_locked_until' => null,
            'email_verified_at' => $request->boolean('send_invite', true) ? null : now(),
        ]);
        $this->syncNamedRole($user, $data['role']);

        if (in_array($data['role'], $this->staffRoles, true)) {
            StaffProfile::create(['organization_id' => $this->orgId($request), 'user_id' => $user->id, 'classroom_id' => $data['classroom_id'] ?? null, 'title' => $data['title'] ?? null]);
        }
        $invitation = null;
        if ($request->boolean('send_invite', true)) {
            $invitation = $this->createOrganizationInvitation($request, Organization::findOrFail($this->orgId($request)), [
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'user_id' => $user->id,
            ]);
        }
        $this->platformAudit($request, 'staff.created', $user, ['role' => $user->role, 'classroom_id' => $data['classroom_id'] ?? null, 'invite_queued' => (bool) $invitation]);

        return response()->json(['user' => $user->load('organization', 'staffProfile.classroom'), 'invitation' => $invitation ? $this->invitationPayload($invitation) : null, 'message' => $invitation ? 'Staff user created and invitation email queued.' : 'Staff user created.'], 201);
    }

    public function updateUser(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'unique:users,email,'.$user->id],
            'phone' => ['nullable', 'string'],
            'role' => ['sometimes', 'in:daycare_admin,manager,staff,teacher,parent,billing_manager'],
            'status' => ['sometimes', 'in:active,blocked,inactive,pending_invite'],
            'classroom_id' => ['nullable', 'exists:classrooms,id'],
            'title' => ['nullable', 'string', 'max:120'],
            'pin' => ['nullable', 'string', 'min:4', 'max:8'],
        ]);
        $before = $user->load('staffProfile')->toArray();
        $updates = collect($data)->except('classroom_id', 'title', 'pin')->all();
        if (! empty($data['pin'])) {
            abort_unless(in_array($data['role'] ?? $user->role, ['teacher', 'staff', 'manager', 'daycare_admin'], true), 422, 'PIN reset is only available for staff users.');
            $updates['pin_hash'] = Hash::make($data['pin']);
            $updates['pin_failed_attempts'] = 0;
            $updates['pin_locked_until'] = null;
        }
        $user->update($updates);
        if (isset($data['role'])) {
            $this->syncNamedRole($user, $data['role']);
        }

        if (array_key_exists('classroom_id', $data) || array_key_exists('title', $data)) {
            StaffProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'organization_id' => $this->orgId($request),
                    'classroom_id' => array_key_exists('classroom_id', $data) ? $data['classroom_id'] : $user->staffProfile?->classroom_id,
                    'title' => array_key_exists('title', $data) ? $data['title'] : $user->staffProfile?->title,
                ]
            );
        }
        $this->platformAudit($request, 'staff.updated', $user, ['before' => $before, 'after' => $user->fresh('staffProfile')->toArray()]);

        return response()->json(['user' => $user->fresh(['organization', 'staffProfile.classroom'])]);
    }

    public function assignRole(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        $data = $request->validate(['role' => ['required', 'in:daycare_admin,manager,staff,teacher,parent,billing_manager']]);
        $user->update(['role' => $data['role']]);
        $this->syncNamedRole($user, $data['role']);

        return response()->json(['user' => $user->fresh('roles')]);
    }

    public function updateUserStatus(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        $data = $request->validate(['status' => ['required', 'in:active,blocked,inactive']]);
        $user->update($data);

        return response()->json(['user' => $user]);
    }

    public function staff(Request $request)
    {
        return response()->json(['staff' => StaffProfile::with('user', 'classroom')->where('organization_id', $this->orgId($request))->get()]);
    }

    public function assignStaffClassroom(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        $data = $request->validate(['classroom_id' => ['nullable', 'exists:classrooms,id']]);
        StaffProfile::updateOrCreate(['user_id' => $user->id], ['organization_id' => $this->orgId($request), 'classroom_id' => $data['classroom_id']]);
        $this->platformAudit($request, 'staff.classroom_assigned', $user, $data);

        return response()->json(['user' => $user->fresh(['staffProfile.classroom'])]);
    }

    public function activateStaffUser(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        $user->update(['status' => 'active']);
        $this->platformAudit($request, 'staff.activated', $user);

        return response()->json(['user' => $user->fresh(['staffProfile.classroom'])]);
    }

    public function deactivateStaffUser(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        $user->update(['status' => 'inactive']);
        $this->platformAudit($request, 'staff.deactivated', $user);

        return response()->json(['user' => $user->fresh(['staffProfile.classroom'])]);
    }

    public function resetStaffPin(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        abort_unless(in_array($user->role, ['teacher', 'staff', 'manager', 'daycare_admin'], true), 422, 'PIN reset is only available for staff users.');
        $data = $request->validate(['pin' => ['required', 'string', 'min:4', 'max:8']]);
        $user->update(['pin_hash' => Hash::make($data['pin']), 'pin_failed_attempts' => 0, 'pin_locked_until' => null]);
        $this->platformAudit($request, 'staff.pin_reset', $user);

        return response()->json(['message' => 'Staff PIN reset.']);
    }

    public function updateOwnerTabletPin(Request $request)
    {
        $user = $request->user();
        abort_unless($user?->organization_id, 403);
        abort_unless(($user->organization?->facility_type ?? 'center_daycare') === 'family_child_care', 403, 'Owner tablet PIN setup is available for Family Child Care accounts.');
        abort_unless(in_array($user->role, ['daycare_admin', 'manager'], true), 403, 'Only the Family Child Care owner or admin can update their own tablet PIN.');

        $data = $request->validate(['pin' => ['required', 'regex:/^\d{4,8}$/']]);
        $user->update(['pin_hash' => Hash::make($data['pin']), 'pin_failed_attempts' => 0, 'pin_locked_until' => null]);
        $this->platformAudit($request, 'owner.tablet_pin_updated', $user);

        return response()->json([
            'message' => 'Owner tablet PIN updated.',
            'user' => $user->fresh('organization'),
            'pin_configured' => true,
        ]);
    }

    public function sendStaffInvite(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        abort_unless(in_array($user->role, ['daycare_admin', 'manager', 'billing_manager', 'teacher', 'staff'], true), 422, 'Invitations are only available for daycare staff users.');
        $invitation = $this->createOrganizationInvitation($request, Organization::findOrFail($this->orgId($request)), [
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'user_id' => $user->id,
        ]);
        if ($user->status !== 'active') {
            $user->update(['status' => 'pending_invite', 'email_verified_at' => null]);
        }

        return response()->json(['invitation' => $this->invitationPayload($invitation), 'message' => 'Staff invitation email queued.']);
    }

    public function sendStaffPasswordReset(Request $request, User $user)
    {
        abort_unless($user->organization_id === $this->orgId($request), 403);
        abort_unless($user->status === 'active', 422, 'This user has not activated their account yet. Send an invitation first.');
        $status = $this->queuePasswordReset($user);

        return response()->json(['message' => $status === Password::RESET_LINK_SENT ? 'Staff reset email queued.' : 'Staff reset email could not be queued.', 'status' => $status], $status === Password::RESET_LINK_SENT ? 200 : 422);
    }

    public function staffProfile(Request $request)
    {
        return response()->json(['staff_profile' => $request->user()->staffProfile?->load('classroom')]);
    }

    public function staffCheckIn(Request $request)
    {
        $row = DB::table('staff_check_ins')->insertGetId(['user_id' => $request->user()->id, 'organization_id' => $this->orgId($request), 'check_in_time' => now(), 'created_at' => now(), 'updated_at' => now()]);
        return response()->json(['staff_check_in_id' => $row], 201);
    }

    public function staffCheckOut(Request $request)
    {
        DB::table('staff_check_ins')->where('user_id', $request->user()->id)->whereNull('check_out_time')->latest('id')->limit(1)->update(['check_out_time' => now(), 'updated_at' => now()]);
        return response()->json(['message' => 'Staff checked out.']);
    }

    public function staffClassroomChildren(Request $request)
    {
        $classroomId = $request->user()->staffProfile?->classroom_id;
        return response()->json(['children' => Child::with('classroom', 'guardians')->where('classroom_id', $classroomId)->get()->map(fn ($child) => $this->childPayload($child))]);
    }

    public function staffActivity(Request $request)
    {
        return response()->json(['activities' => DB::table('staff_activity_logs')->where('organization_id', $this->orgId($request))->latest()->get()]);
    }

    public function invoices(Request $request)
    {
        $query = Invoice::with('child', 'guardian', 'payments')->where('organization_id', $this->orgId($request));
        if ($request->user()->role === 'parent') {
            $guardianIds = Guardian::where('user_id', $request->user()->id)->pluck('id');
            $query->whereIn('guardian_id', $guardianIds);
        }
        return response()->json(['invoices' => $query->latest()->get()->map(fn ($invoice) => $this->invoicePayload($invoice))]);
    }

    public function showInvoice(Request $request, Invoice $invoice)
    {
        abort_unless($invoice->organization_id === $this->orgId($request), 403);
        return response()->json(['invoice' => $this->invoicePayload($invoice->load('child', 'guardian', 'items', 'payments'))]);
    }

    public function createInvoice(Request $request)
    {
        $data = $request->validate(['child_id' => ['nullable', 'exists:children,id'], 'guardian_id' => ['nullable', 'exists:guardians,id'], 'amount' => ['required', 'numeric'], 'due_date' => ['required', 'date']]);
        $data['organization_id'] = $this->orgId($request);
        $data['invoice_number'] = 'INV-'.now()->format('YmdHis');
        $invoice = Invoice::create($data)->load('child.guardians', 'guardian');
        $this->notifications->notifyParentInvoiceCreated($invoice, $request->user());

        return response()->json(['invoice' => $this->invoicePayload($invoice)], 201);
    }

    public function recordPayment(Request $request, Invoice $invoice)
    {
        abort_unless($invoice->organization_id === $this->orgId($request), 403);
        $data = $request->validate(['amount' => ['required', 'numeric'], 'method' => ['required', 'string']]);
        $paymentId = DB::table('payments')->insertGetId(['invoice_id' => $invoice->id, 'amount' => $data['amount'], 'method' => $data['method'], 'status' => 'paid', 'paid_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $invoice->update(['status' => 'paid']);
        DB::table('receipts')->insert(['payment_id' => $paymentId, 'receipt_number' => 'RCT-'.$paymentId, 'created_at' => now(), 'updated_at' => now()]);
        $fresh = $invoice->fresh(['child.guardians', 'guardian', 'payments']);
        $this->notifications->notifyParentPaymentRecorded($fresh, $request->user());

        return response()->json(['invoice' => $this->invoicePayload($fresh)]);
    }

    public function paymentHistory(Request $request)
    {
        $query = DB::table('payments')
            ->join('invoices', 'invoices.id', '=', 'payments.invoice_id')
            ->leftJoin('children', 'children.id', '=', 'invoices.child_id')
            ->where('invoices.organization_id', $this->orgId($request));
        if ($request->user()->role === 'parent') {
            $guardianIds = Guardian::where('user_id', $request->user()->id)->pluck('id');
            $query->whereIn('invoices.guardian_id', $guardianIds);
        }

        return response()->json(['payments' => $query->select([
            'payments.*',
            'invoices.invoice_number',
            'invoices.child_id',
            'children.child_code',
            'children.first_name',
            'children.last_name',
        ])->latest('payments.created_at')->get()]);
    }

    public function receiptDownload()
    {
        return response()->json(['message' => 'Legacy parent billing receipts are not available in the attendance-first demo. Platform payment receipts are available from subscription billing.'], 404);
    }

    public function stripePlaceholder()
    {
        return response()->json(['message' => 'Stripe payment placeholder accepted.']);
    }

    public function daycareSubscription(Request $request)
    {
        $subscription = Subscription::with('organization', 'pricingPlan')
            ->where('organization_id', $this->orgId($request))
            ->latest()
            ->first();

        return response()->json([
            'subscription' => $subscription ? $this->subscriptionPayload($subscription) : null,
            'open_balance' => (float) PlatformInvoice::where('organization_id', $this->orgId($request))->whereIn('status', ['open', 'partial', 'overdue'])->sum('balance_due'),
            'requires_payment' => $this->subscriptionAccess->requiresPayment($subscription),
            'unpaid_invoice' => ($invoice = PlatformInvoice::where('organization_id', $this->orgId($request))->whereIn('status', ['open', 'partial', 'overdue'])->oldest('due_date')->first()) ? $this->platformInvoicePayload($invoice->load('organization', 'subscription.pricingPlan', 'payments')) : null,
            'stripe_mode' => config('services.stripe.mode', 'test'),
            'stripe_configured' => (bool) config('services.stripe.secret'),
            'test_payment_enabled' => $this->isTestPaymentEnabled(),
        ]);
    }

    public function daycarePlatformInvoices(Request $request)
    {
        $this->refreshOverduePlatformInvoices($this->orgId($request));

        return response()->json([
            'invoices' => PlatformInvoice::with('organization', 'subscription.pricingPlan', 'payments')
                ->where('organization_id', $this->orgId($request))
                ->latest('due_date')
                ->get()
                ->map(fn (PlatformInvoice $invoice) => $this->platformInvoicePayload($invoice)),
        ]);
    }

    public function daycarePlatformPayments(Request $request)
    {
        return response()->json([
            'payments' => PlatformPayment::with('organization', 'invoice', 'recorder')
                ->where('organization_id', $this->orgId($request))
                ->latest('paid_at')
                ->get()
                ->map(fn (PlatformPayment $payment) => $this->platformPaymentPayload($payment)),
        ]);
    }

    public function requestPlanChange(Request $request)
    {
        $data = $request->validate([
            'requested_plan' => ['nullable', 'string', 'max:255'],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        $this->platformAudit($request, 'platform_billing.plan_change_requested', Organization::find($this->orgId($request)), $data);

        return response()->json(['message' => 'Plan change request noted for platform admin follow-up.']);
    }

    public function createStripeCheckoutSession(Request $request)
    {
        $subscription = Subscription::with('pricingPlan', 'organization')->where('organization_id', $this->orgId($request))->latest()->first();
        $invoice = PlatformInvoice::where('organization_id', $this->orgId($request))->whereIn('status', ['open', 'partial', 'overdue'])->oldest('due_date')->first();
        abort_unless($subscription, 422, 'No active subscription found for this organization.');
        abort_unless($invoice, 422, 'No unpaid platform invoice is available for checkout.');

        if (! $this->stripe->isConfigured()) {
            return response()->json(['message' => 'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.'], 422);
        }

        try {
            $priceId = config('services.stripe.price_id');
            if ($priceId) {
                $session = $this->stripe->createSubscriptionCheckout(
                    $subscription->organization,
                    $subscription
                );
            } else {
                $session = $this->stripe->createOneTimeCheckout(
                    $subscription->organization,
                    $subscription,
                    $invoice
                );
                $invoice->update(['stripe_payment_intent_id' => $session->payment_intent]);
            }

            return response()->json([
                'checkout_url' => $session->url,
                'session_id' => $session->id,
                'message' => 'Stripe Checkout session created. Redirecting to payment page.',
            ]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            return response()->json(['message' => 'Stripe error: '.$e->getMessage()], 422);
        }
    }

    public function confirmStripeSession(Request $request)
    {
        $data = $request->validate([
            'session_id' => ['required', 'string'],
        ]);

        if (! $this->stripe->isConfigured()) {
            return response()->json(['message' => 'Stripe is not configured.'], 422);
        }

        try {
            $session = $this->stripe->client()->checkout->sessions->retrieve(
                $data['session_id'],
                ['expand' => ['subscription', 'payment_intent']]
            );
        } catch (\Stripe\Exception\ApiErrorException $e) {
            \Illuminate\Support\Facades\Log::error('confirm-session: Stripe API error', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Could not retrieve Stripe session: '.$e->getMessage()], 422);
        }

        if ($session->payment_status !== 'paid') {
            return response()->json([
                'success' => false,
                'payment_status' => $session->payment_status,
                'message' => 'Payment not yet completed.',
            ], 422);
        }

        // Best-effort: run the shared activation logic (handles emails, syncs, etc.)
        try {
            $this->handleCheckoutSessionCompleted($session);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('confirm-session: handleCheckoutSessionCompleted threw', [
                'error' => $e->getMessage(),
            ]);
        }

        // Direct activation guarantee — activate the org's subscription by org ID so this
        // always succeeds even if handleCheckoutSessionCompleted hit a metadata or type issue.
        $orgId = $this->orgId($request);
        $subscription = Subscription::with('organization', 'pricingPlan')
            ->where('organization_id', $orgId)
            ->latest()
            ->first();

        if ($subscription && in_array($subscription->status, ['pending_activation', 'pending_payment', 'past_due'], true)) {
            $subscription->update(['status' => 'active']);
            $subscription->organization?->update([
                'status'       => 'active',
                'approved_at'  => $subscription->organization?->approved_at ?? now(),
            ]);
            $this->syncOrganizationBillingSummary($subscription->fresh(['pricingPlan']));
        }

        // Settle the open invoice if handleCheckoutSessionCompleted didn't already do it.
        $this->settleOpenInvoiceForSession($session, $orgId);

        $subscription = $subscription?->fresh(['organization', 'pricingPlan']);

        return response()->json([
            'success' => true,
            'subscription' => $subscription ? $this->subscriptionPayload($subscription) : null,
        ]);
    }

    public function testPaymentSuccess(Request $request)
    {
        abort_unless($this->isTestPaymentEnabled(), 403, 'Test payment success is disabled outside local/test mode.');
        $invoice = PlatformInvoice::where('organization_id', $this->orgId($request))
            ->whereIn('status', ['open', 'partial', 'overdue'])
            ->oldest('due_date')
            ->first();
        abort_unless($invoice, 422, 'No unpaid platform invoice is available for test payment.');
        $payment = $this->recordPlatformPaymentForInvoice($request, $invoice, [
            'amount' => (float) $invoice->balance_due,
            'method' => 'stripe_test',
            'reference' => 'LOCAL-TEST-SUCCESS',
            'paid_at' => now(),
            'notes' => 'Local/test subscription payment activation.',
        ]);
        if ($invoice->subscription) {
            $invoice->subscription->update(['status' => 'active']);
            $invoice->subscription->organization?->update(['status' => 'active', 'approved_at' => $invoice->subscription->organization?->approved_at ?? now()]);
            $subscription = $invoice->subscription->fresh(['organization', 'pricingPlan']);
            $this->syncOrganizationBillingSummary($subscription);
            $this->sendSubscriptionActivatedEmails($subscription);
        }
        $this->platformAudit($request, 'platform_payment.test_success', $payment, ['invoice_id' => $invoice->id]);

        return response()->json([
            'message' => 'Test payment recorded. Subscription activated.',
            'invoice' => $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments'])),
            'subscription' => $invoice->subscription ? $this->subscriptionPayload($invoice->subscription->fresh(['organization', 'pricingPlan'])) : null,
        ]);
    }

    public function incidents(Request $request)
    {
        $childIds = $this->visibleChildren($request)->pluck('id');
        return response()->json(['incidents' => IncidentReport::with('child.classroom', 'classroom', 'staff')->where('organization_id', $this->orgId($request))->whereIn('child_id', $childIds)->latest('occurred_at')->get()->map(fn ($incident) => $this->incidentPayload($incident))]);
    }

    public function createIncident(Request $request)
    {
        $data = $request->validate(['child_id' => ['required', 'exists:children,id'], 'severity' => ['required', 'in:low,medium,high'], 'status' => ['sometimes', 'in:draft,sent,resolved'], 'summary' => ['required'], 'occurred_at' => ['nullable', 'date']]);
        $child = Child::findOrFail($data['child_id']);
        $this->authorizeChild($request, $child);
        $data += ['organization_id' => $child->organization_id, 'classroom_id' => $child->classroom_id, 'staff_user_id' => $request->user()->id, 'occurred_at' => $data['occurred_at'] ?? now()];
        $incident = IncidentReport::create($data)->load('child.guardians', 'child.classroom', 'classroom', 'staff');
        $this->notifications->notifyParentIncidentCreated($incident, $request->user());

        return response()->json(['incident' => $this->incidentPayload($incident)], 201);
    }

    public function showIncident(Request $request, IncidentReport $incident)
    {
        abort_unless($incident->organization_id === $this->orgId($request), 403);
        return response()->json(['incident' => $this->incidentPayload($incident->load('child.classroom', 'classroom', 'staff'))]);
    }

    public function updateIncident(Request $request, IncidentReport $incident)
    {
        abort_unless($incident->organization_id === $this->orgId($request), 403);
        $data = $request->validate([
            'severity' => ['sometimes', 'in:low,medium,high'],
            'status' => ['sometimes', 'in:draft,sent,resolved'],
            'summary' => ['sometimes', 'string'],
            'occurred_at' => ['sometimes', 'date'],
        ]);
        $incident->update($data);

        return response()->json(['incident' => $this->incidentPayload($incident->fresh(['child.classroom', 'classroom', 'staff']))]);
    }

    public function notifyParent()
    {
        return response()->json(['message' => 'Parent notification placeholder queued.']);
    }

    public function dailyNotes(Request $request)
    {
        $query = DailyChildNote::with('child.classroom', 'child.guardians')->where('organization_id', $this->orgId($request))->whereIn('child_id', $this->visibleChildren($request)->pluck('id'));
        if ($request->filled('child_id')) {
            $query->where('child_id', $request->integer('child_id'));
        }

        return response()->json(['daily_notes' => $query->latest('date')->get()->map(fn ($note) => $this->dailyNotePayload($note))]);
    }

    public function createDailyNote(Request $request)
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'date' => ['sometimes', 'date'],
            'note' => ['required', 'string'],
        ]);
        $child = Child::findOrFail($data['child_id']);
        $this->authorizeChild($request, $child);
        $data += ['organization_id' => $child->organization_id, 'staff_user_id' => $request->user()->id, 'date' => now()->toDateString()];

        $note = DailyChildNote::create($data)->load('child.classroom', 'child.guardians');
        $this->notifications->notifyParentDailyNoteCreated($note, $request->user());

        return response()->json(['daily_note' => $this->dailyNotePayload($note)], 201);
    }

    public function updateDailyNote(Request $request, DailyChildNote $note)
    {
        abort_unless($note->organization_id === $this->orgId($request), 403);
        $note->update($request->validate(['date' => ['sometimes', 'date'], 'note' => ['sometimes', 'string']]));

        return response()->json(['daily_note' => $this->dailyNotePayload($note->fresh(['child.classroom', 'child.guardians']))]);
    }

    public function conversations(Request $request)
    {
        return response()->json(['conversations' => Conversation::with('messages')->where('organization_id', $this->orgId($request))->latest()->get()]);
    }

    public function createConversation(Request $request)
    {
        $data = $request->validate(['subject' => ['nullable', 'string']]);

        return response()->json(['conversation' => Conversation::create(['organization_id' => $this->orgId($request), 'subject' => $data['subject'] ?? 'New conversation'])], 201);
    }

    public function conversationMessages(Request $request, Conversation $conversation)
    {
        abort_unless($conversation->organization_id === $this->orgId($request), 403);

        return response()->json(['messages' => $conversation->messages()->latest()->get()]);
    }

    public function sendMessage(Request $request)
    {
        $data = $request->validate(['conversation_id' => ['nullable', 'exists:conversations,id'], 'body' => ['required', 'string']]);
        $conversation = isset($data['conversation_id']) ? Conversation::find($data['conversation_id']) : Conversation::create(['organization_id' => $this->orgId($request), 'subject' => 'New conversation']);
        $message = Message::create(['conversation_id' => $conversation->id, 'sender_id' => $request->user()->id, 'body' => $data['body']]);
        $this->notifications->notifyMessageReceived($message->load('conversation'), $request->user());

        return response()->json(['message' => $message], 201);
    }

    public function notifications(Request $request)
    {
        $query = $this->notificationQuery($request)->with('recipient', 'creator');

        if ($request->filled('type')) {
            $query->where('type', $request->string('type'));
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->string('priority'));
        }
        if ($request->filled('status')) {
            match ((string) $request->string('status')) {
                'read' => $query->whereNotNull('read_at'),
                'unread' => $query->whereNull('read_at'),
                default => null,
            };
        }

        return response()->json(['notifications' => $query->latest()->get()->map(fn ($notification) => $this->notificationPayload($notification))]);
    }

    public function createNotification(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['nullable', 'exists:users,id'],
            'title' => ['required', 'string'],
            'body' => ['nullable', 'string'],
            'type' => ['sometimes', 'string'],
            'priority' => ['sometimes', 'in:low,normal,high,urgent'],
            'delivery_channel' => ['sometimes', 'in:in_app,sms,email,push'],
        ]);
        $data['type'] = $data['type'] ?? 'announcement';
        $data['organization_id'] = $this->orgId($request);
        $data['created_by'] = $request->user()->id;

        if (! empty($data['user_id'])) {
            $recipient = User::where('organization_id', $this->orgId($request))->findOrFail($data['user_id']);
            $notification = $this->notifications->createForUser($recipient, $data);
        } else {
            $notification = Notification::create([
                ...$data,
                'delivery_channel' => $data['delivery_channel'] ?? 'in_app',
                'delivery_status' => ($data['delivery_channel'] ?? 'in_app') === 'in_app' ? 'delivered' : 'pending',
                'delivered_at' => ($data['delivery_channel'] ?? 'in_app') === 'in_app' ? now() : null,
                'priority' => $data['priority'] ?? 'normal',
            ]);
        }

        return response()->json(['notification' => $this->notificationPayload($notification->fresh(['recipient', 'creator']))], 201);
    }

    public function markNotificationRead(Request $request, Notification $notification)
    {
        $this->authorizeNotification($request, $notification);
        $notification->update(['read_at' => now()]);

        return response()->json(['notification' => $this->notificationPayload($notification->fresh(['recipient', 'creator']))]);
    }

    public function unreadNotificationCount(Request $request)
    {
        return response()->json(['unread_count' => $this->notificationQuery($request)->whereNull('read_at')->count()]);
    }

    public function markAllNotificationsRead(Request $request)
    {
        $count = (clone $this->notificationQuery($request))->whereNull('read_at')->count();
        $this->notificationQuery($request)->whereNull('read_at')->update(['read_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Notifications marked read.', 'updated' => $count]);
    }

    public function deleteNotification(Request $request, Notification $notification)
    {
        $this->authorizeNotification($request, $notification);
        $notification->delete();

        return response()->json(['message' => 'Notification deleted.']);
    }

    public function createTestNotification(Request $request)
    {
        $notification = $this->notifications->createForUser($request->user(), [
            'title' => 'Demo notification',
            'body' => 'This is an internal in-app demo notification. SMS, email, and push providers are not connected yet.',
            'type' => 'announcement',
            'priority' => 'normal',
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['notification' => $this->notificationPayload($notification)], 201);
    }

    public function announcement()
    {
        return response()->json(['message' => 'Announcement placeholder sent.']);
    }

    public function documents(Request $request)
    {
        $query = Document::with('child.classroom', 'child.guardians')->where('organization_id', $this->orgId($request));
        if (in_array($request->user()->role, ['parent', 'staff', 'teacher'], true)) {
            $query->where(fn ($q) => $q->whereNull('child_id')->orWhereIn('child_id', $this->visibleChildren($request)->pluck('id')));
        }

        return response()->json(['documents' => $query->latest()->get()->map(fn ($document) => $this->documentPayload($document))]);
    }

    public function uploadDocument(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['nullable', 'string', 'max:80'],
            'child_id' => ['nullable', 'exists:children,id'],
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png,doc,docx,txt'],
        ]);

        if (! empty($data['child_id'])) {
            $this->authorizeChild($request, Child::findOrFail($data['child_id']));
        } elseif (in_array($request->user()->role, $this->staffRoles, true)) {
            abort(422, 'Please select a child for staff document uploads.');
        }

        $file = $request->file('file');
        $path = $file->store('documents/'.$this->orgId($request));

        unset($data['file']);
        $data += [
            'organization_id' => $this->orgId($request),
            'uploaded_by' => $request->user()->id,
            'path' => $path,
            'disk' => config('filesystems.default', 'local'),
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType(),
            'size' => $file->getSize(),
        ];
        $document = Document::create($data)->load('child.classroom', 'child.guardians');
        if ($document->child_id) {
            DB::table('child_documents')->updateOrInsert(
                ['child_id' => $document->child_id, 'document_id' => $document->id],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
        $this->notifications->notifyParentDocumentUploaded($document->load('child.guardians'), $request->user());

        return response()->json(['document' => $this->documentPayload($document)], 201);
    }

    public function downloadDocument(Request $request, Document $document)
    {
        $this->authorizeDocument($request, $document);

        $disk = $document->disk ?: config('filesystems.default', 'local');
        abort_unless($document->path && Storage::disk($disk)->exists($document->path), 404, 'Document file was not found.');

        return Storage::disk($disk)->download(
            $document->path,
            $document->original_name ?: Str::slug($document->title).'.bin',
            array_filter(['Content-Type' => $document->mime_type])
        );
    }

    public function deleteDocument(Request $request, Document $document)
    {
        $this->authorizeDocument($request, $document);
        if ($document->path && Storage::disk($document->disk ?: config('filesystems.default', 'local'))->exists($document->path)) {
            Storage::disk($document->disk ?: config('filesystems.default', 'local'))->delete($document->path);
        }
        $document->delete();

        return response()->json(['message' => 'Document deleted.']);
    }

    public function platformDashboard()
    {
        return response()->json([
            'metrics' => [
                ['label' => 'Organizations', 'value' => (string) Organization::count(), 'detail' => 'Total tenants', 'tone' => 'primary'],
                ['label' => 'MRR', 'value' => '$'.number_format((float) Organization::sum('mrr'), 2), 'detail' => 'Current platform MRR', 'tone' => 'secondary'],
                ['label' => 'Users', 'value' => (string) User::count(), 'detail' => 'Global accounts', 'tone' => 'tertiary'],
                ['label' => 'Open tickets', 'value' => (string) SupportTicket::where('status', 'open')->count(), 'detail' => 'Support queue', 'tone' => 'danger'],
            ],
            'alerts' => SystemAlert::latest()->limit(10)->get(),
        ]);
    }

    public function platformBillingDashboard()
    {
        $this->refreshOverduePlatformInvoices();
        $active = Subscription::where('status', 'active')->count();
        $trialing = Subscription::whereIn('status', ['trial', 'trialing'])->count();
        $pastDue = Subscription::where('status', 'past_due')->count();
        $suspended = Subscription::where('status', 'suspended')->count();
        $mrr = Subscription::with('pricingPlan')->where('status', 'active')->get()->sum(function (Subscription $subscription) {
            $plan = $subscription->pricingPlan;
            if (! $plan) {
                return 0;
            }

            return $subscription->billing_cycle === 'yearly'
                ? ((float) $plan->yearly_price / 12)
                : (float) $plan->monthly_price;
        });
        $monthStart = now()->startOfMonth();

        return response()->json([
            'metrics' => [
                ['label' => 'MRR', 'value' => '$'.number_format($mrr, 2), 'detail' => 'Manual + Stripe-ready subscriptions', 'tone' => 'primary'],
                ['label' => 'ARR estimate', 'value' => '$'.number_format($mrr * 12, 2), 'detail' => 'Based on current MRR', 'tone' => 'secondary'],
                ['label' => 'Active subscriptions', 'value' => (string) $active, 'detail' => 'Organizations currently active', 'tone' => 'success'],
                ['label' => 'Trialing', 'value' => (string) $trialing, 'detail' => 'Trial organizations', 'tone' => 'warning'],
                ['label' => 'Past due', 'value' => (string) $pastDue, 'detail' => 'Needs collection follow-up', 'tone' => 'danger'],
                ['label' => 'Suspended', 'value' => (string) $suspended, 'detail' => 'Explicitly suspended', 'tone' => 'danger'],
                ['label' => 'Open invoices', 'value' => (string) PlatformInvoice::whereIn('status', ['open', 'partial', 'overdue'])->count(), 'detail' => '$'.number_format((float) PlatformInvoice::whereIn('status', ['open', 'partial', 'overdue'])->sum('balance_due'), 2).' due', 'tone' => 'warning'],
                ['label' => 'Revenue this month', 'value' => '$'.number_format((float) PlatformPayment::where('paid_at', '>=', $monthStart)->sum('amount'), 2), 'detail' => 'Recorded platform payments', 'tone' => 'secondary'],
            ],
            'recent_payments' => PlatformPayment::with('organization', 'invoice', 'recorder')->latest('paid_at')->limit(8)->get()->map(fn (PlatformPayment $payment) => $this->platformPaymentPayload($payment)),
            'upcoming_renewals' => Subscription::with('organization', 'pricingPlan')->whereNotNull('next_invoice_at')->orderBy('next_invoice_at')->limit(8)->get()->map(fn (Subscription $subscription) => $this->subscriptionPayload($subscription)),
            'stripe' => [
                'mode' => config('services.stripe.mode', 'test'),
                'configured' => (bool) config('services.stripe.secret'),
                'live' => config('services.stripe.mode', 'test') === 'live',
            ],
        ]);
    }

    public function platformOrganizations()
    {
        return response()->json(['organizations' => Organization::withCount(['children', 'users as staff_count' => fn ($q) => $q->whereIn('role', ['staff', 'teacher', 'manager', 'daycare_admin'])])->get()->map(fn ($org) => $this->organizationPayload($org))]);
    }

    public function platformRegistrationApplications(Request $request)
    {
        $status = $request->string('status')->toString();
        $query = FacilityRegistrationApplication::with('pricingPlan', 'organization', 'reviewer')->latest();
        if (in_array($status, ['pending', 'approved', 'rejected', 'follow_up'], true)) {
            $query->where('status', $status);
        }

        return response()->json(['applications' => $query->get()->map(fn (FacilityRegistrationApplication $application) => $this->registrationApplicationPayload($application))]);
    }

    public function approveRegistrationApplication(Request $request, FacilityRegistrationApplication $application)
    {
        abort_if($application->status === 'approved' && $application->organization_id, 422, 'This application has already been approved.');
        $data = $request->validate([
            'pricing_plan_id' => ['nullable', 'exists:pricing_plans,id'],
            'billing_cycle' => ['nullable', 'in:monthly,yearly'],
            'review_notes' => ['nullable', 'string', 'max:3000'],
        ]);

        $created = DB::transaction(function () use ($request, $application, $data) {
            $planId = $data['pricing_plan_id'] ?? $application->pricing_plan_id ?? PricingPlan::where('status', 'active')->orderBy('monthly_price')->value('id');
            if ($application->facility_type === 'family_child_care' && empty($data['pricing_plan_id']) && empty($application->pricing_plan_id)) {
                $planId = PricingPlan::where('status', 'active')
                    ->where(function ($query) {
                        $query->whereRaw('LOWER(code) = ?', ['starter'])
                            ->orWhereRaw('LOWER(name) = ?', ['starter']);
                    })
                    ->value('id');
            }
            abort_unless($planId, 422, 'Create an active pricing plan before approving applications.');
            $plan = PricingPlan::findOrFail($planId);
            $this->validateFacilityPlanSelection($application->facility_type, $plan);
            abort_if(
                ($application->facility_type === 'family_child_care' && ! $plan->available_for_family_child_care)
                || ($application->facility_type === 'center_daycare' && ! $plan->available_for_center_daycare),
                422,
                'The selected plan is not available for this facility type.'
            );
            $organization = $this->createOrganizationFromApplication($request, $application, $plan, $data['billing_cycle'] ?? $application->billing_cycle ?? 'monthly');
            $application->update([
                'status' => 'approved',
                'review_notes' => $data['review_notes'] ?? $application->review_notes,
                'pricing_plan_id' => $plan->id,
                'billing_cycle' => $data['billing_cycle'] ?? $application->billing_cycle ?? 'monthly',
                'organization_id' => $organization['organization']['id'],
                'reviewed_by' => $request->user()?->id,
                'reviewed_at' => now(),
            ]);

            $this->platformAudit($request, 'facility_application.approved', $application, [
                'organization_id' => $organization['organization']['id'],
                'facility_type' => $application->facility_type,
            ]);

            return [
                'application' => $this->registrationApplicationPayload($application->fresh(['pricingPlan', 'organization', 'reviewer'])),
                ...$organization,
            ];
        });

        return response()->json($created, 201);
    }

    public function rejectRegistrationApplication(Request $request, FacilityRegistrationApplication $application)
    {
        $data = $request->validate(['review_notes' => ['nullable', 'string', 'max:3000']]);
        $application->update([
            'status' => 'rejected',
            'review_notes' => $data['review_notes'] ?? null,
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ]);
        $this->platformAudit($request, 'facility_application.rejected', $application, ['review_notes' => $application->review_notes]);

        return response()->json(['application' => $this->registrationApplicationPayload($application->fresh(['pricingPlan', 'organization', 'reviewer']))]);
    }

    public function requestRegistrationApplicationFollowUp(Request $request, FacilityRegistrationApplication $application)
    {
        $data = $request->validate(['review_notes' => ['required', 'string', 'max:3000']]);
        $application->update([
            'status' => 'follow_up',
            'review_notes' => $data['review_notes'],
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ]);
        $this->platformAudit($request, 'facility_application.follow_up_requested', $application, ['review_notes' => $application->review_notes]);

        return response()->json(['application' => $this->registrationApplicationPayload($application->fresh(['pricingPlan', 'organization', 'reviewer']))]);
    }

    public function createOrganization(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'facility_type' => ['nullable', 'in:family_child_care,center_daycare'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'website' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'max:120'],
            'timezone' => ['nullable', 'string', 'max:80'],
            'license_number' => ['nullable', 'string', 'max:255'],
            'license_status' => ['nullable', 'in:not_provided,pending,verified,rejected,expired'],
            'pricing_plan_id' => ['required', 'exists:pricing_plans,id'],
            'billing_cycle' => ['required', 'in:monthly,yearly'],
            'trial_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'primary_admin' => ['required', 'array'],
            'primary_admin.name' => ['required', 'string', 'max:255'],
            'primary_admin.email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'primary_admin.phone' => ['nullable', 'string', 'max:50'],
            'extra_users' => ['sometimes', 'array'],
            'extra_users.*.name' => ['required_with:extra_users', 'string', 'max:255'],
            'extra_users.*.email' => ['required_with:extra_users', 'email', 'max:255', 'distinct', 'unique:users,email'],
            'extra_users.*.phone' => ['nullable', 'string', 'max:50'],
            'extra_users.*.role' => ['required_with:extra_users', 'in:daycare_admin,manager,billing_manager,teacher,staff'],
        ]);
        abort_if(
            collect($data['extra_users'] ?? [])->pluck('email')->contains($data['primary_admin']['email']),
            422,
            'Extra user emails must be different from the primary admin email.'
        );

        $created = DB::transaction(function () use ($request, $data) {
            $plan = PricingPlan::findOrFail($data['pricing_plan_id']);
            $facilityType = $data['facility_type'] ?? 'center_daycare';
            $this->validateFacilityPlanSelection($facilityType, $plan);
            abort_if(
                ($facilityType === 'family_child_care' && ! $plan->available_for_family_child_care)
                || ($facilityType === 'center_daycare' && ! $plan->available_for_center_daycare),
                422,
                'The selected plan is not available for this facility type.'
            );
            $timezone = (! empty($data['timezone']) && in_array($data['timezone'], timezone_identifiers_list(), true))
                ? $data['timezone']
                : 'America/New_York';
            $licenseNumber = trim((string) ($data['license_number'] ?? ''));
            $licenseStatus = $licenseNumber === '' ? ($data['license_status'] ?? 'not_provided') : ($data['license_status'] ?? 'pending');
            $organization = Organization::create([
                'name' => $data['name'],
                'organization_code' => $this->generateOrganizationCode($data['name']),
                'facility_type' => $facilityType,
                'legal_name' => $data['legal_name'] ?? null,
                'phone' => $data['phone'] ?? null,
                'email' => $data['email'] ?? null,
                'website' => $data['website'] ?? null,
                'address' => $data['address'] ?? null,
                'city' => $data['city'] ?? null,
                'state' => $data['state'] ?? null,
                'country' => $data['country'] ?? null,
                'timezone' => $timezone,
                'license_number' => $licenseNumber !== '' ? $licenseNumber : null,
                'license_status' => $licenseStatus,
                'status' => 'pending_setup',
                'plan' => $plan->name,
                'mrr' => 0,
                'approved_at' => null,
            ]);
            $this->updateOrganizationTimezone($organization, $timezone);

            $periodStart = now();
            $periodEnd = $data['billing_cycle'] === 'yearly' ? now()->addYear() : now()->addMonth();
            $subscription = Subscription::create([
                'organization_id' => $organization->id,
                'pricing_plan_id' => $plan->id,
                'billing_cycle' => $data['billing_cycle'],
                'status' => 'pending_activation',
                'provider' => 'manual',
                'current_period_start' => $periodStart,
                'current_period_end' => $periodEnd,
                'current_period_ends_at' => $periodEnd,
                'trial_ends_at' => ! empty($data['trial_days']) ? now()->addDays((int) $data['trial_days']) : null,
                'next_invoice_at' => $periodEnd,
                'notes' => 'Created from Super Admin organization onboarding.',
            ]);

            $invitations = collect([$this->createOrganizationInvitation($request, $organization, $data['primary_admin'] + ['role' => 'daycare_admin'])]);
            foreach ($data['extra_users'] ?? [] as $extraUser) {
                $invitations->push($this->createOrganizationInvitation($request, $organization, $extraUser));
            }

            // Always create an initial invoice so the org admin sees an amount to pay on login.
            $invoice = $this->ensureSubscriptionInvoice($subscription->fresh(['pricingPlan']));

            $this->platformAudit($request, 'organization.onboarded', $organization, [
                'pricing_plan_id' => $plan->id,
                'billing_cycle' => $data['billing_cycle'],
                'invitations_created' => $invitations->count(),
                'initial_invoice_id' => $invoice?->id,
            ]);

            return [
                'organization' => $this->organizationPayload($organization->fresh()),
                'subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan'])),
                'invitations' => $invitations->map(fn (OrganizationInvitation $invitation) => $this->invitationPayload($invitation))->values(),
                'invoice' => $invoice ? $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments'])) : null,
                'invite_note' => 'Invitation emails have been queued for delivery.',
            ];
        });

        return response()->json($created, 201);
    }

    public function updateOrganizationStatus(Request $request, Organization $organization)
    {
        $data = $request->validate(['status' => ['required', 'in:active,pending,suspended,trial']]);
        $before = $organization->only(['status', 'approved_at']);
        $organization->update(['status' => $data['status'], 'approved_at' => $data['status'] === 'active' ? now() : $organization->approved_at]);

        // Trigger 1: org approved — ensure a subscription invoice exists
        if ($data['status'] === 'active') {
            $subscription = Subscription::with('pricingPlan')
                ->where('organization_id', $organization->id)
                ->latest()
                ->first();
            if ($subscription && in_array($subscription->status, ['pending_activation', 'pending_payment'], true)) {
                $this->ensureSubscriptionInvoice($subscription);
                if ($subscription->status === 'pending_activation') {
                    $subscription->update(['status' => 'pending_payment']);
                }
            }
        }

        $this->platformAudit($request, 'organization.status_updated', $organization, ['before' => $before, 'after' => $organization->only(['status', 'approved_at'])]);
        return response()->json(['organization' => $this->organizationPayload($organization->fresh())]);
    }

    public function organizationUsers(Request $request, Organization $organization)
    {
        $users = User::where('organization_id', $organization->id)->latest()->get();
        return response()->json([
            'users' => $users->map(fn (User $user) => $this->orgUserPayload($user)),
        ]);
    }

    public function createOrganizationUser(Request $request, Organization $organization)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'role' => ['required', 'in:daycare_admin,manager,billing_manager,teacher,staff'],
            'send_invite' => ['sometimes', 'boolean'],
        ]);

        if ($request->boolean('send_invite', true)) {
            $invitation = $this->createOrganizationInvitation($request, $organization, $data);
            return response()->json([
                'invitation' => $this->invitationPayload($invitation),
                'message' => 'Invitation created and email queued.',
            ], 201);
        }

        $user = $this->createOrganizationLoginUser($organization, $data + ['password' => Str::random(16)]);
        return response()->json(['user' => $this->orgUserPayload($user)], 201);
    }

    public function disableOrganizationUser(Request $request, Organization $organization, User $user)
    {
        abort_unless($user->organization_id === $organization->id, 403, 'User does not belong to this organization.');
        abort_if($user->id === $request->user()->id, 422, 'You cannot disable your own account.');
        $user->update(['status' => 'inactive']);
        $this->platformAudit($request, 'organization_user.disabled', $user, ['organization_id' => $organization->id]);
        return response()->json(['user' => $this->orgUserPayload($user->fresh())]);
    }

    public function enableOrganizationUser(Request $request, Organization $organization, User $user)
    {
        abort_unless($user->organization_id === $organization->id, 403, 'User does not belong to this organization.');
        $user->update(['status' => 'active']);
        $this->platformAudit($request, 'organization_user.enabled', $user, ['organization_id' => $organization->id]);
        return response()->json(['user' => $this->orgUserPayload($user->fresh())]);
    }

    public function organizationInvitations(Organization $organization)
    {
        $invitations = OrganizationInvitation::where('organization_id', $organization->id)->latest()->get();
        return response()->json([
            'invitations' => $invitations->map(fn (OrganizationInvitation $inv) => $this->invitationPayload($inv)),
        ]);
    }

    public function createOrganizationInvite(Request $request, Organization $organization)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'role' => ['required', 'in:daycare_admin,manager,billing_manager,teacher,staff'],
        ]);

        $existing = OrganizationInvitation::where('email', $data['email'])->where('organization_id', $organization->id)->where('status', 'pending')->first();
        if ($existing) {
            $existing->update(['expires_at' => now()->addDays(14)]);
            $existing->load('organization');
            Mail::to($existing->email)->queue(new OrganizationInvitationMail($existing));
            return response()->json(['invitation' => $this->invitationPayload($existing), 'message' => 'Existing invitation refreshed and resent.'], 200);
        }

        $invitation = $this->createOrganizationInvitation($request, $organization, $data);
        return response()->json(['invitation' => $this->invitationPayload($invitation), 'message' => 'Invitation created and email queued.'], 201);
    }

    public function resendOrganizationInvitation(Request $request, Organization $organization, OrganizationInvitation $invitation)
    {
        abort_unless($invitation->organization_id === $organization->id, 403);
        abort_unless($invitation->status === 'pending', 422, 'Only pending invitations can be resent.');
        $invitation->update(['token' => Str::random(64), 'expires_at' => now()->addDays(14)]);
        $invitation->load('organization');
        Mail::to($invitation->email)->queue(new OrganizationInvitationMail($invitation));
        $this->platformAudit($request, 'invitation.resent', $organization, ['email' => $invitation->email]);
        return response()->json(['invitation' => $this->invitationPayload($invitation->fresh()), 'message' => 'Invitation resent successfully.']);
    }

    public function cancelOrganizationInvitation(Request $request, Organization $organization, OrganizationInvitation $invitation)
    {
        abort_unless($invitation->organization_id === $organization->id, 403);
        $invitation->update(['status' => 'cancelled']);
        $this->platformAudit($request, 'invitation.cancelled', $organization, ['email' => $invitation->email]);
        return response()->json(['message' => 'Invitation cancelled.']);
    }

    private function orgUserPayload(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'status' => $user->status,
            'organization_id' => $user->organization_id,
            'created_at' => optional($user->created_at)->toDateTimeString(),
        ];
    }

    public function platformPricingPlans()
    {
        return response()->json(['pricing_plans' => PricingPlan::latest()->get()->map(fn ($plan) => $this->pricingPlanPayload($plan))]);
    }

    public function createPricingPlan(Request $request)
    {
        $data = $this->validatePricingPlan($request);
        $plan = PricingPlan::create($data);
        $this->platformAudit($request, 'pricing_plan.created', $plan, ['name' => $plan->name]);

        return response()->json(['pricing_plan' => $this->pricingPlanPayload($plan)], 201);
    }

    public function updatePricingPlan(Request $request, PricingPlan $plan)
    {
        $data = $this->validatePricingPlan($request, true);
        $before = $plan->only(array_keys($data));
        $plan->update($data);
        $this->platformAudit($request, 'pricing_plan.updated', $plan, ['before' => $before, 'after' => $data]);

        return response()->json(['pricing_plan' => $this->pricingPlanPayload($plan->fresh())]);
    }

    public function activatePricingPlan(Request $request, PricingPlan $plan)
    {
        $plan->update(['status' => 'active']);
        $this->platformAudit($request, 'pricing_plan.activated', $plan, ['name' => $plan->name]);

        return response()->json(['pricing_plan' => $this->pricingPlanPayload($plan->fresh())]);
    }

    public function deactivatePricingPlan(Request $request, PricingPlan $plan)
    {
        $plan->update(['status' => 'inactive']);
        $this->platformAudit($request, 'pricing_plan.deactivated', $plan, ['name' => $plan->name]);

        return response()->json(['pricing_plan' => $this->pricingPlanPayload($plan->fresh())]);
    }

    public function platformSubscriptions()
    {
        return response()->json([
            'subscriptions' => Subscription::with('organization', 'pricingPlan')->latest()->get()->map(fn ($subscription) => $this->subscriptionPayload($subscription)),
            'plans' => PricingPlan::all()->map(fn ($plan) => $this->pricingPlanPayload($plan)),
            'organizations' => Organization::orderBy('name')->get()->map(fn ($organization) => $this->organizationPayload($organization)),
        ]);
    }

    public function createPlatformSubscription(Request $request)
    {
        $data = $request->validate([
            'organization_id' => ['required', 'exists:organizations,id'],
            'pricing_plan_id' => ['required', 'exists:pricing_plans,id'],
            'billing_cycle' => ['required', 'in:monthly,yearly'],
            'status' => ['sometimes', 'in:trialing,trial,active,past_due,paused,canceled,suspended'],
            'provider' => ['sometimes', 'in:manual,stripe'],
            'notes' => ['nullable', 'string'],
        ]);
        $periodStart = now();
        $periodEnd = $data['billing_cycle'] === 'yearly' ? now()->addYear() : now()->addMonth();

        $subscription = Subscription::updateOrCreate(
            ['organization_id' => $data['organization_id']],
            [
                'pricing_plan_id' => $data['pricing_plan_id'],
                'billing_cycle' => $data['billing_cycle'],
                'status' => $data['status'] ?? 'active',
                'provider' => $data['provider'] ?? 'manual',
                'current_period_start' => $periodStart,
                'current_period_end' => $periodEnd,
                'current_period_ends_at' => $periodEnd,
                'next_invoice_at' => $periodEnd,
                'notes' => $data['notes'] ?? null,
            ]
        );
        $this->syncOrganizationBillingSummary($subscription);
        $this->platformAudit($request, 'platform_subscription.created_or_updated', $subscription, $data);

        return response()->json(['subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan']))], 201);
    }

    public function updateSubscriptionStatus(Request $request, Subscription $subscription)
    {
        $data = $request->validate(['status' => ['required', 'in:trialing,trial,active,past_due,paused,canceled,suspended']]);
        $updates = ['status' => $data['status']];
        if ($data['status'] === 'paused') {
            $updates['paused_at'] = now();
        }
        if ($data['status'] === 'canceled') {
            $updates['canceled_at'] = now();
        }
        if ($data['status'] === 'active') {
            $updates['paused_at'] = null;
            $updates['canceled_at'] = null;
        }
        $subscription->update($updates);
        $this->syncOrganizationBillingSummary($subscription->fresh(['pricingPlan']));
        $this->platformAudit($request, 'subscription.status_updated', $subscription, $data);

        return response()->json(['subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan']))]);
    }

    public function updatePlatformSubscription(Request $request, Subscription $subscription)
    {
        $data = $request->validate([
            'pricing_plan_id' => ['sometimes', 'exists:pricing_plans,id'],
            'billing_cycle' => ['sometimes', 'in:monthly,yearly'],
            'status' => ['sometimes', 'in:trialing,trial,active,past_due,paused,canceled,suspended'],
            'provider' => ['sometimes', 'in:manual,stripe'],
            'notes' => ['nullable', 'string'],
        ]);
        $subscription->update($data);
        $this->syncOrganizationBillingSummary($subscription->fresh(['pricingPlan']));
        $this->platformAudit($request, 'platform_subscription.updated', $subscription, $data);

        return response()->json(['subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan']))]);
    }

    public function pausePlatformSubscription(Request $request, Subscription $subscription) { return $this->setPlatformSubscriptionStatus($request, $subscription, 'paused', 'platform_subscription.paused'); }
    public function resumePlatformSubscription(Request $request, Subscription $subscription) { return $this->setPlatformSubscriptionStatus($request, $subscription, 'active', 'platform_subscription.resumed'); }
    public function cancelPlatformSubscription(Request $request, Subscription $subscription) { return $this->setPlatformSubscriptionStatus($request, $subscription, 'canceled', 'platform_subscription.canceled'); }
    public function suspendPlatformSubscription(Request $request, Subscription $subscription) { return $this->setPlatformSubscriptionStatus($request, $subscription, 'suspended', 'platform_subscription.suspended'); }

    public function changeSubscriptionPlan(Request $request, Subscription $subscription)
    {
        $data = $request->validate([
            'pricing_plan_id' => ['required', 'exists:pricing_plans,id'],
            'billing_cycle' => ['sometimes', 'in:monthly,yearly'],
        ]);
        $subscription->update($data);
        $freshSubscription = $subscription->fresh(['pricingPlan']);
        $this->syncOrganizationBillingSummary($freshSubscription);

        // Trigger 2: plan assigned/changed — ensure invoice exists if org needs payment
        if (in_array($subscription->status, ['pending_activation', 'pending_payment'], true)) {
            $this->ensureSubscriptionInvoice($freshSubscription);
            if ($subscription->status === 'pending_activation') {
                $subscription->update(['status' => 'pending_payment']);
            }
        }

        $this->platformAudit($request, 'subscription.plan_changed', $subscription, $data);

        return response()->json(['subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan']))]);
    }

    public function platformInvoices(Request $request)
    {
        $this->refreshOverduePlatformInvoices();
        $query = PlatformInvoice::with('organization', 'subscription.pricingPlan', 'payments');
        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }
        if ($request->filled('organization_id')) {
            $query->where('organization_id', $request->integer('organization_id'));
        }

        return response()->json(['invoices' => $query->latest('due_date')->get()->map(fn (PlatformInvoice $invoice) => $this->platformInvoicePayload($invoice))]);
    }

    public function createPlatformInvoice(Request $request)
    {
        $data = $request->validate([
            'organization_id' => ['required_without:subscription_id', 'exists:organizations,id'],
            'subscription_id' => ['nullable', 'exists:subscriptions,id'],
            'due_date' => ['nullable', 'date'],
            'billing_period_start' => ['nullable', 'date'],
            'billing_period_end' => ['nullable', 'date'],
            'subtotal' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);
        $subscription = ! empty($data['subscription_id']) ? Subscription::with('pricingPlan')->findOrFail($data['subscription_id']) : null;
        $organizationId = $subscription?->organization_id ?? (int) $data['organization_id'];
        $plan = $subscription?->pricingPlan;
        $subtotal = array_key_exists('subtotal', $data) && $data['subtotal'] !== null
            ? (float) $data['subtotal']
            : (float) ($subscription?->billing_cycle === 'yearly' ? $plan?->yearly_price : $plan?->monthly_price);
        $tax = (float) ($data['tax_amount'] ?? 0);
        $discount = (float) ($data['discount_amount'] ?? 0);
        $total = max(0, $subtotal + $tax - $discount);

        $invoice = PlatformInvoice::create([
            'organization_id' => $organizationId,
            'subscription_id' => $subscription?->id,
            'invoice_number' => 'PLAT-'.now()->format('YmdHis').'-'.Str::upper(Str::random(4)),
            'billing_period_start' => $data['billing_period_start'] ?? optional($subscription?->current_period_start)->toDateString() ?? now()->toDateString(),
            'billing_period_end' => $data['billing_period_end'] ?? optional($subscription?->current_period_end)->toDateString() ?? ($subscription?->billing_cycle === 'yearly' ? now()->addYear()->toDateString() : now()->addMonth()->toDateString()),
            'due_date' => $data['due_date'] ?? now()->addDays(14)->toDateString(),
            'currency' => $plan?->currency ?? 'USD',
            'subtotal' => $subtotal,
            'tax_amount' => $tax,
            'discount_amount' => $discount,
            'total_amount' => $total,
            'balance_due' => $total,
            'status' => $total > 0 ? 'open' : 'paid',
            'payment_method' => 'manual',
            'notes' => $data['notes'] ?? null,
        ]);
        $this->platformAudit($request, 'platform_invoice.created', $invoice, ['invoice_number' => $invoice->invoice_number, 'total_amount' => $total]);

        if ($total > 0) {
            $freshInvoice = $invoice->fresh(['organization', 'subscription.pricingPlan', 'payments']);
            $admins = User::where('organization_id', $organizationId)->whereIn('role', ['daycare_admin', 'manager'])->where('status', 'active')->get();
            foreach ($admins as $admin) {
                Mail::to($admin->email)->queue(new PlatformInvoiceMail($freshInvoice));
            }
        }

        return response()->json(['invoice' => $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments']))], 201);
    }

    public function showPlatformInvoice(PlatformInvoice $invoice)
    {
        return response()->json(['invoice' => $this->platformInvoicePayload($invoice->load('organization', 'subscription.pricingPlan', 'payments.recorder'))]);
    }

    public function markPlatformInvoicePaid(Request $request, PlatformInvoice $invoice)
    {
        $remaining = (float) $invoice->balance_due;
        if ($remaining > 0) {
            $this->recordPlatformPaymentForInvoice($request, $invoice, [
                'amount' => $remaining,
                'method' => $request->input('method', 'manual'),
                'reference' => $request->input('reference', 'Marked paid'),
                'paid_at' => $request->input('paid_at', now()),
                'notes' => $request->input('notes'),
            ]);
        } else {
            $this->recalculatePlatformInvoice($invoice);
        }
        $this->platformAudit($request, 'platform_invoice.marked_paid', $invoice);

        return response()->json(['invoice' => $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments']))]);
    }

    public function recordPlatformInvoicePayment(Request $request, PlatformInvoice $invoice)
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'method' => ['required', 'in:cash,bank_transfer,manual,stripe_test,stripe_live'],
            'reference' => ['nullable', 'string'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        $payment = $this->recordPlatformPaymentForInvoice($request, $invoice, $data);
        $this->platformAudit($request, 'platform_payment.recorded', $payment, ['amount' => $payment->amount, 'invoice_id' => $invoice->id]);

        return response()->json([
            'invoice' => $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments'])),
            'payment' => $this->platformPaymentPayload($payment->fresh(['organization', 'invoice', 'recorder'])),
        ], 201);
    }

    public function voidPlatformInvoice(Request $request, PlatformInvoice $invoice)
    {
        $invoice->update(['status' => 'void', 'balance_due' => 0]);
        $this->platformAudit($request, 'platform_invoice.voided', $invoice, ['invoice_number' => $invoice->invoice_number]);

        return response()->json(['invoice' => $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments']))]);
    }

    public function platformPayments(Request $request)
    {
        $query = PlatformPayment::with('organization', 'invoice', 'recorder');
        if ($request->filled('organization_id')) {
            $query->where('organization_id', $request->integer('organization_id'));
        }

        return response()->json(['payments' => $query->latest('paid_at')->get()->map(fn (PlatformPayment $payment) => $this->platformPaymentPayload($payment))]);
    }

    public function syncStripePlan()
    {
        if (! config('services.stripe.secret')) {
            return response()->json(['message' => 'Stripe test mode is not configured yet.'], 422);
        }

        return response()->json(['message' => 'Stripe plan sync is ready for test-mode integration, but not enabled in this demo build.'], 202);
    }

    public function stripeWebhook(Request $request)
    {
        $payload = $request->getContent();
        $signature = $request->header('Stripe-Signature', '');

        $providerEvent = PaymentProviderEvent::create([
            'provider' => 'stripe',
            'mode' => config('services.stripe.mode', 'test'),
            'event_id' => $request->input('id'),
            'event_type' => $request->input('type', 'unknown'),
            'payload' => $request->all(),
            'status' => 'received',
        ]);

        if (! $this->stripe->isConfigured()) {
            $providerEvent->update(['status' => 'skipped', 'error_message' => 'Stripe not configured']);
            return response()->json(['message' => 'Stripe not configured.'], 200);
        }

        try {
            $event = $this->stripe->constructWebhookEvent($payload, $signature);
        } catch (\Stripe\Exception\SignatureVerificationException $e) {
            $providerEvent->update(['status' => 'failed', 'error_message' => 'Signature verification failed: '.$e->getMessage()]);
            return response()->json(['message' => 'Invalid signature.'], 400);
        } catch (\RuntimeException $e) {
            $providerEvent->update(['status' => 'skipped', 'error_message' => $e->getMessage()]);
            return response()->json(['message' => $e->getMessage()], 200);
        }

        $providerEvent->update(['event_id' => $event->id, 'event_type' => $event->type, 'status' => 'processing']);

        try {
            $this->handleStripeEvent($event, $providerEvent);
            $providerEvent->update(['status' => 'processed', 'processed_at' => now()]);
        } catch (\Throwable $e) {
            $providerEvent->update(['status' => 'failed', 'error_message' => $e->getMessage()]);
            return response()->json(['message' => 'Webhook processing error.'], 500);
        }

        return response()->json(['received' => true], 200);
    }

    private function handleStripeEvent(\Stripe\Event $event, PaymentProviderEvent $providerEvent): void
    {
        $data = $event->data->object;

        match ($event->type) {
            'checkout.session.completed' => $this->handleCheckoutSessionCompleted($data),
            'payment_intent.succeeded' => $this->handlePaymentIntentSucceeded($data),
            'customer.subscription.deleted' => $this->handleStripeSubscriptionDeleted($data),
            'customer.subscription.updated' => $this->handleStripeSubscriptionUpdated($data),
            'invoice.payment_succeeded' => $this->handleStripeInvoicePaymentSucceeded($data),
            'invoice.payment_failed' => $this->handleStripeInvoicePaymentFailed($data),
            default => null,
        };
    }

    private function handleCheckoutSessionCompleted(object $session): void
    {
        $metadata = $this->stripeMetadata($session->metadata ?? null);
        $subscriptionId = $metadata['subscription_id'] ?? null;
        $invoiceId = $metadata['invoice_id'] ?? null;
        $mode = $metadata['mode'] ?? 'platform_billing';

        $localSubscription = $subscriptionId ? Subscription::with('organization', 'pricingPlan')->find($subscriptionId) : null;

        // For subscription mode: store stripe_subscription_id and activate
        if ($mode === 'platform_subscription' && $localSubscription) {
            // When retrieved with expand=['subscription'], $session->subscription is a full
            // Stripe\Subscription object. Extract ID and period dates safely.
            $stripeSubRaw = $session->subscription ?? null;
            $stripeSubId  = is_string($stripeSubRaw) ? $stripeSubRaw : ($stripeSubRaw?->id ?? null);

            // Extract billing period from the expanded Stripe subscription.
            $periodStart = is_object($stripeSubRaw) && isset($stripeSubRaw->current_period_start)
                ? Carbon::createFromTimestamp($stripeSubRaw->current_period_start)
                : null;
            $periodEnd = is_object($stripeSubRaw) && isset($stripeSubRaw->current_period_end)
                ? Carbon::createFromTimestamp($stripeSubRaw->current_period_end)
                : null;

            $subUpdate = [
                'stripe_subscription_id' => $stripeSubId,
                'stripe_customer_id'     => $session->customer ?? $localSubscription->stripe_customer_id,
                'status'                 => 'active',
            ];
            if ($periodStart) {
                $subUpdate['current_period_start']  = $periodStart;
                $subUpdate['current_period_end']    = $periodEnd;
                $subUpdate['current_period_ends_at'] = $periodEnd;
                $subUpdate['next_invoice_at']        = $periodEnd;
            }
            $localSubscription->update($subUpdate);

            $localSubscription->organization?->update([
                'stripe_customer_id' => $session->customer,
                'status'             => 'active',
                'approved_at'        => $localSubscription->organization?->approved_at ?? now(),
            ]);

            // Pay the org's open platform invoice and create a payment history record.
            $this->settleOpenInvoiceForSession($session, $localSubscription->organization_id);

            $freshSubscription = $localSubscription->fresh(['organization', 'pricingPlan']);
            $this->syncOrganizationBillingSummary($freshSubscription);
            $this->sendSubscriptionActivatedEmails($freshSubscription);
            return;
        }

        // For one-time payment mode
        if (! $invoiceId) return;
        $invoice = PlatformInvoice::with('subscription.organization', 'subscription.pricingPlan')->find($invoiceId);
        if (! $invoice || $invoice->status === 'paid') return;

        // payment_intent may be an expanded object or a string depending on the caller.
        $piRaw = $session->payment_intent ?? null;
        $piId  = is_string($piRaw) ? $piRaw : ($piRaw?->id ?? null);

        $fakeRequest = new Request();
        $this->recordPlatformPaymentForInvoice($fakeRequest, $invoice, [
            'amount'    => (float) $invoice->balance_due,
            'method'    => 'stripe_live',
            'reference' => $piId ?? $session->id,
            'paid_at'   => now(),
            'notes'     => 'Stripe Checkout payment (session: '.$session->id.')',
        ]);

        if ($piId) {
            $invoice->update(['stripe_payment_intent_id' => $piId]);
        }

        if ($invoice->subscription) {
            $invoice->subscription->update([
                'status'             => 'active',
                'stripe_customer_id' => $session->customer ?? $invoice->subscription->stripe_customer_id,
            ]);
            $invoice->subscription->organization?->update([
                'stripe_customer_id' => $session->customer,
                'status'             => 'active',
                'approved_at'        => $invoice->subscription->organization?->approved_at ?? now(),
            ]);
            $freshSubscription = $invoice->subscription->fresh(['organization', 'pricingPlan']);
            $this->syncOrganizationBillingSummary($freshSubscription);
            $this->sendSubscriptionActivatedEmails($freshSubscription);
        }
    }

    private function handlePaymentIntentSucceeded(object $paymentIntent): void
    {
        $metadata = $this->stripeMetadata($paymentIntent->metadata ?? null);
        $invoiceId = $metadata['invoice_id'] ?? null;
        if (! $invoiceId) return;

        $invoice = PlatformInvoice::with('subscription.organization', 'subscription.pricingPlan')->find($invoiceId);
        if (! $invoice || $invoice->status === 'paid') return;

        $fakeRequest = new Request();
        $this->recordPlatformPaymentForInvoice($fakeRequest, $invoice, [
            'amount' => (float) $paymentIntent->amount_received / 100,
            'method' => 'stripe_live',
            'reference' => $paymentIntent->id,
            'paid_at' => now(),
            'notes' => 'Stripe PaymentIntent (id: '.$paymentIntent->id.')',
        ]);
    }

    private function handleStripeSubscriptionDeleted(object $stripeSub): void
    {
        $subscription = Subscription::where('stripe_subscription_id', $stripeSub->id)->first();
        if ($subscription) {
            $subscription->update(['status' => 'canceled', 'canceled_at' => now()]);
            $this->syncOrganizationBillingSummary($subscription->fresh(['pricingPlan']));
        }
    }

    private function handleStripeSubscriptionUpdated(object $stripeSub): void
    {
        $subscription = Subscription::where('stripe_subscription_id', $stripeSub->id)->first();
        if (! $subscription) return;

        $statusMap = [
            'active' => 'active',
            'trialing' => 'trialing',
            'past_due' => 'past_due',
            'canceled' => 'canceled',
            'unpaid' => 'suspended',
            'paused' => 'suspended',
            'incomplete' => 'pending_payment',
            'incomplete_expired' => 'canceled',
        ];

        $newStatus = $statusMap[$stripeSub->status] ?? $subscription->status;
        $subscription->update([
            'status' => $newStatus,
            'current_period_start' => Carbon::createFromTimestamp($stripeSub->current_period_start),
            'current_period_end' => Carbon::createFromTimestamp($stripeSub->current_period_end),
        ]);
        $this->syncOrganizationBillingSummary($subscription->fresh(['pricingPlan']));
    }

    private function handleStripeInvoicePaymentSucceeded(object $stripeInvoice): void
    {
        $subscription = Subscription::where('stripe_customer_id', $stripeInvoice->customer)->latest()->first();
        if (! $subscription) return;

        $invoice = PlatformInvoice::where('stripe_invoice_id', $stripeInvoice->id)->first()
            ?? PlatformInvoice::where('organization_id', $subscription->organization_id)->whereIn('status', ['open', 'partial', 'overdue'])->oldest('due_date')->first();

        if ($invoice && $invoice->status !== 'paid') {
            $fakeRequest = new Request();
            $this->recordPlatformPaymentForInvoice($fakeRequest, $invoice, [
                'amount' => $stripeInvoice->amount_paid / 100,
                'method' => 'stripe_live',
                'reference' => $stripeInvoice->payment_intent,
                'paid_at' => now(),
                'notes' => 'Stripe invoice payment (id: '.$stripeInvoice->id.')',
            ]);
        }
    }

    private function handleStripeInvoicePaymentFailed(object $stripeInvoice): void
    {
        $subscription = Subscription::where('stripe_customer_id', $stripeInvoice->customer)->latest()->first();
        if ($subscription && $subscription->status === 'active') {
            $subscription->update(['status' => 'past_due']);
            $this->syncOrganizationBillingSummary($subscription->fresh(['pricingPlan']));
        }
    }

    private function stripeMetadata(mixed $metadata): array
    {
        if (! $metadata) {
            return [];
        }

        if (is_array($metadata)) {
            return $metadata;
        }

        if (method_exists($metadata, 'toArray')) {
            return $metadata->toArray();
        }

        $values = [];
        foreach ($metadata as $key => $value) {
            $values[$key] = $value;
        }

        return $values;
    }

    public function platformUsers(Request $request)
    {
        $query = User::with('organization')->latest();
        if ($request->filled('role')) $query->where('role', $request->string('role'));
        if ($request->filled('status')) $query->where('status', $request->string('status'));
        if ($request->filled('organization_id')) $query->where('organization_id', $request->integer('organization_id'));
        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"));
        }

        return response()->json(['users' => $query->get()->map(fn ($user) => $this->platformUserPayload($user))]);
    }

    public function blockPlatformUser(Request $request, User $user)
    {
        abort_if($user->id === $request->user()->id, 422, 'You cannot block your own super admin account.');
        $user->update(['status' => 'blocked']);
        $this->platformAudit($request, 'user.blocked', $user, ['email' => $user->email]);

        return response()->json(['user' => $this->platformUserPayload($user->fresh('organization'))]);
    }

    public function unblockPlatformUser(Request $request, User $user)
    {
        $user->update(['status' => 'active']);
        $this->platformAudit($request, 'user.unblocked', $user, ['email' => $user->email]);

        return response()->json(['user' => $this->platformUserPayload($user->fresh('organization'))]);
    }

    public function resetPlatformUser(Request $request, User $user)
    {
        $this->platformAudit($request, 'user.reset_account_requested', $user, ['email' => $user->email]);

        return response()->json(['message' => 'Password reset placeholder queued.']);
    }

    public function updatePlatformUserRole(Request $request, User $user)
    {
        $data = $request->validate(['role' => ['required', 'in:super_admin,daycare_admin,manager,teacher,staff,parent,billing_manager,support_staff']]);
        abort_if($user->id === $request->user()->id && $data['role'] !== 'super_admin', 422, 'You cannot remove your own super admin role.');
        $user->update($data);
        $this->platformAudit($request, 'user.role_updated', $user, $data);

        return response()->json(['user' => $this->platformUserPayload($user->fresh('organization'))]);
    }

    public function supportTickets()
    {
        return response()->json(['support_tickets' => SupportTicket::with('organization', 'openedBy', 'assignee', 'comments.user')->latest()->get()->map(fn ($ticket) => $this->supportTicketPayload($ticket))]);
    }

    public function createSupportTicket(Request $request)
    {
        $data = $request->validate([
            'organization_id' => ['nullable', 'exists:organizations,id'],
            'subject' => ['required', 'string'],
            'description' => ['nullable', 'string'],
            'priority' => ['required', 'in:low,normal,high,urgent'],
            'status' => ['sometimes', 'in:open,in_progress,resolved,closed'],
            'assigned_to' => ['nullable', 'exists:users,id'],
        ]);
        $ticket = SupportTicket::create($data + ['opened_by' => $request->user()->id, 'status' => $data['status'] ?? 'open']);
        $this->platformAudit($request, 'support_ticket.created', $ticket, ['subject' => $ticket->subject]);

        return response()->json(['support_ticket' => $this->supportTicketPayload($ticket->load('organization', 'openedBy', 'assignee', 'comments.user'))], 201);
    }

    public function updateSupportTicket(Request $request, SupportTicket $ticket)
    {
        $data = $request->validate([
            'subject' => ['sometimes', 'string'],
            'description' => ['sometimes', 'nullable', 'string'],
            'priority' => ['sometimes', 'in:low,normal,high,urgent'],
            'status' => ['sometimes', 'in:open,in_progress,resolved,closed'],
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
        ]);
        $ticket->update($data);
        $this->platformAudit($request, 'support_ticket.updated', $ticket, $data);

        return response()->json(['support_ticket' => $this->supportTicketPayload($ticket->fresh(['organization', 'openedBy', 'assignee', 'comments.user']))]);
    }

    public function updateSupportTicketStatus(Request $request, SupportTicket $ticket)
    {
        $data = $request->validate(['status' => ['required', 'in:open,in_progress,resolved,closed']]);
        $ticket->update($data);
        $this->platformAudit($request, 'support_ticket.status_updated', $ticket, $data);

        return response()->json(['support_ticket' => $this->supportTicketPayload($ticket->fresh(['organization', 'openedBy', 'assignee', 'comments.user']))]);
    }

    public function commentSupportTicket(Request $request, SupportTicket $ticket)
    {
        $data = $request->validate(['body' => ['required', 'string']]);
        $comment = SupportTicketComment::create(['support_ticket_id' => $ticket->id, 'user_id' => $request->user()->id, 'body' => $data['body']]);
        $this->platformAudit($request, 'support_ticket.commented', $ticket, ['comment_id' => $comment->id]);

        return response()->json(['comment' => $comment->load('user')], 201);
    }

    public function closeSupportTicket(Request $request, SupportTicket $ticket)
    {
        $ticket->update(['status' => 'closed']);
        $this->platformAudit($request, 'support_ticket.closed', $ticket, ['subject' => $ticket->subject]);

        return response()->json(['support_ticket' => $this->supportTicketPayload($ticket->fresh(['organization', 'openedBy', 'assignee', 'comments.user']))]);
    }

    public function auditLogs()
    {
        return response()->json(['audit_logs' => AuditLog::with('actor', 'organization')->latest()->get()->map(fn ($log) => $this->auditLogPayload($log))]);
    }

    public function platformSettings()
    {
        $settings = PlatformSetting::all()->keyBy('key');

        return response()->json(['settings' => $settings->values(), 'settings_map' => $settings->map(fn ($setting) => $setting->value)]);
    }

    public function updatePlatformSettings(Request $request)
    {
        $data = $request->validate(['key' => ['required', 'string'], 'value' => ['nullable']]);
        $setting = PlatformSetting::updateOrCreate(['key' => $data['key']], ['value' => $data['value'] ?? []]);
        $this->platformAudit($request, 'platform_setting.updated', $setting, [$data['key'] => $data['value'] ?? []]);

        return response()->json(['setting' => $setting]);
    }

    public function bulkUpdatePlatformSettings(Request $request)
    {
        $settings = $request->validate(['settings' => ['required', 'array']])['settings'];
        $saved = collect($settings)->map(fn ($value, $key) => PlatformSetting::updateOrCreate(['key' => $key], ['value' => $value]))->values();
        $this->platformAudit($request, 'platform_settings.bulk_updated', null, ['keys' => array_keys($settings)]);

        return response()->json(['settings' => $saved]);
    }

    public function devices(Request $request) { return response()->json(['devices' => Device::where('organization_id', $this->orgId($request))->get()]); }

    public function systemAlerts(Request $request)
    {
        $query = SystemAlert::latest();
        if ($request->filled('severity')) $query->where('severity', $request->string('severity'));
        if ($request->filled('type')) $query->where('type', $request->string('type'));
        if ($request->filled('status')) {
            $request->string('status') === 'resolved' ? $query->whereNotNull('resolved_at') : $query->whereNull('resolved_at');
        }

        return response()->json(['system_alerts' => $query->get()]);
    }

    public function createSystemAlert(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string'],
            'body' => ['nullable', 'string'],
            'severity' => ['required', 'in:info,warning,critical'],
            'type' => ['required', 'in:payment_failure,api_error,downtime,database_warning,security,general'],
        ]);
        $alert = SystemAlert::create($data);
        $this->platformAudit($request, 'system_alert.created', $alert, ['title' => $alert->title]);

        return response()->json(['system_alert' => $alert], 201);
    }

    public function resolveSystemAlert(Request $request, SystemAlert $alert)
    {
        $alert->update(['resolved_at' => now()]);
        $this->platformAudit($request, 'system_alert.resolved', $alert, ['title' => $alert->title]);

        return response()->json(['system_alert' => $alert->fresh()]);
    }

    public function reopenSystemAlert(Request $request, SystemAlert $alert)
    {
        $alert->update(['resolved_at' => null]);
        $this->platformAudit($request, 'system_alert.reopened', $alert, ['title' => $alert->title]);

        return response()->json(['system_alert' => $alert->fresh()]);
    }

    public function monitoringHealth()
    {
        $database = 'healthy';
        try {
            DB::select('select 1');
        } catch (\Throwable) {
            $database = 'unhealthy';
        }

        return response()->json([
            'api' => 'healthy',
            'database' => $database,
            'queue' => 'placeholder',
            'scheduler' => 'placeholder',
            'stripe' => 'placeholder',
            'sms' => 'placeholder',
            'email' => 'placeholder',
            'error_count' => SystemAlert::whereNull('resolved_at')->whereIn('severity', ['warning', 'critical'])->count(),
            'checked_at' => now()->toDateTimeString(),
        ]);
    }

    public function registerDevice(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string'],
            'type' => ['sometimes', 'string'],
            'identifier' => ['required', 'string', 'unique:devices,identifier'],
            'classroom_id' => ['nullable', 'exists:classrooms,id'],
        ]);
        $data['organization_id'] = $this->orgId($request);

        return response()->json(['device' => Device::create($data)], 201);
    }

    public function assignDeviceClassroom(Request $request, Device $device)
    {
        abort_unless($device->organization_id === $this->orgId($request), 403);
        $data = $request->validate(['classroom_id' => ['nullable', 'exists:classrooms,id']]);
        $device->update($data);

        return response()->json(['device' => $device->fresh('classroom')]);
    }

    public function disableDevice(Request $request, Device $device)
    {
        abort_unless($device->organization_id === $this->orgId($request), 403);
        $device->update(['status' => 'disabled']);

        return response()->json(['device' => $device]);
    }

    public function attendanceReport(Request $request)
    {
        return response()->json(['attendance' => $this->attendance($request)->getData(true)['attendance'], 'summary' => ['records' => AttendanceRecord::where('organization_id', $this->orgId($request))->count()]]);
    }

    public function revenueReport(Request $request)
    {
        $orgId = $this->orgId($request);

        return response()->json([
            'revenue' => [
                'invoiced' => (float) Invoice::where('organization_id', $orgId)->sum('amount'),
                'paid' => (float) DB::table('payments')->join('invoices', 'invoices.id', '=', 'payments.invoice_id')->where('invoices.organization_id', $orgId)->sum('payments.amount'),
            ],
        ]);
    }

    public function occupancyReport(Request $request)
    {
        return response()->json(['occupancy' => Classroom::withCount('children')->where('organization_id', $this->orgId($request))->get()->map(fn ($classroom) => [
            'classroom' => $classroom->name,
            'children' => $classroom->children_count,
            'capacity' => $classroom->capacity,
            'percentage' => $classroom->capacity > 0 ? round(($classroom->children_count / $classroom->capacity) * 100, 1) : 0,
        ])]);
    }

    public function dcyfExport()
    {
        return response()->json(['message' => 'DCYF export placeholder queued.']);
    }

    private function orgId(Request $request): int
    {
        return (int) $request->user()->organization_id;
    }

    private function visibleChildren(Request $request): Builder
    {
        $user = $request->user();
        $query = Child::query()->where('organization_id', $this->orgId($request));

        if ($user->role === 'parent') {
            $guardianIds = Guardian::where('user_id', $user->id)->where('status', 'active')->pluck('id');
            $query->whereHas('guardians', fn ($q) => $q->whereIn('guardians.id', $guardianIds));
        }

        if (in_array($user->role, $this->staffRoles, true) && ($user->organization?->facility_type ?? 'center_daycare') === 'center_daycare') {
            $query->where('classroom_id', $user->staffProfile?->classroom_id);
        }

        return $query;
    }

    private function authorizeChild(Request $request, Child $child): void
    {
        abort_unless($this->visibleChildren($request)->where('children.id', $child->id)->exists(), 403);
    }

    private function authorizeTabletChild(Request $request, Child $child): void
    {
        $mode = $request->string('mode')->toString();
        abort_unless((int) $child->organization_id === $this->orgId($request), 403);
        abort_unless($this->tabletChildren($request, $mode)->where('children.id', $child->id)->exists(), 403, 'This child is not available for the unlocked tablet mode.');
    }

    private function authorizeAssistingStaff(Request $request, Child $child, mixed $staffId): void
    {
        if (! $staffId) {
            return;
        }
        $staff = User::with('staffProfile')->findOrFail($staffId);
        abort_unless((int) $staff->organization_id === $this->orgId($request), 403);
        abort_unless(in_array($staff->role, ['staff', 'teacher', 'daycare_admin', 'manager'], true), 422, 'Selected assisting staff is not allowed for attendance.');
        if (in_array($staff->role, $this->staffRoles, true)) {
            abort_unless((int) $staff->staffProfile?->classroom_id === (int) $child->classroom_id, 403, 'Selected staff can only assist their assigned classroom.');
        }
    }

    private function authorizeAbsence(Request $request, AbsenceRecord $absence, bool $manage = false): void
    {
        abort_unless((int) $absence->organization_id === $this->orgId($request), 403);
        abort_unless($this->visibleChildren($request)->where('children.id', $absence->child_id)->exists(), 403);

        if ($manage) {
            abort_unless(in_array($request->user()->role, [...$this->managerRoles, ...$this->staffRoles], true), 403);
        }
    }

    private function authorizeDocument(Request $request, Document $document): void
    {
        abort_unless((int) $document->organization_id === $this->orgId($request), 403);

        if (in_array($request->user()->role, ['parent', 'staff', 'teacher'], true) && $document->child_id) {
            abort_unless($this->visibleChildren($request)->where('children.id', $document->child_id)->exists(), 403);
        }
    }

    private function notificationQuery(Request $request): Builder
    {
        $user = $request->user();
        $query = Notification::query()->where('organization_id', $this->orgId($request));

        if (in_array($user->role, ['parent', 'staff', 'teacher'], true)) {
            $query->where('user_id', $user->id);
        } elseif (in_array($user->role, $this->managerRoles, true)) {
            $query->where(fn ($q) => $q->whereNull('user_id')->orWhereHas('recipient', fn ($recipient) => $recipient->where('organization_id', $this->orgId($request))));
        } else {
            $query->where('user_id', $user->id);
        }

        return $query;
    }

    private function authorizeNotification(Request $request, Notification $notification): void
    {
        abort_unless($this->notificationQuery($request)->where('notifications.id', $notification->id)->exists(), 403);
    }

    private function attendanceAudit(AttendanceRecord $record, string $action, ?array $original, ?array $corrected, string $reason, int $userId): void
    {
        AttendanceAuditLog::create(['attendance_record_id' => $record->id, 'action' => $action, 'original_value' => $original, 'corrected_value' => $corrected, 'reason' => $reason, 'edited_by_user_id' => $userId, 'edited_at' => now()]);
    }

    private function consumePinVerificationIfNeeded(Request $request, array $data): void
    {
        if (($data['verification_method'] ?? null) !== 'pin') {
            return;
        }

        $query = PinVerificationLog::where('id', $data['pin_verification_id'] ?? 0)
            ->where('success', true)
            ->whereNull('used_at')
            ->where('verified_at', '>=', now()->subMinutes(10));

        if (in_array($data['signer_type'] ?? null, ['guardian', 'parent'], true) && ! empty($data['guardian_id'])) {
            $query->where('purpose', 'tablet_signer:guardian:'.$data['guardian_id']);
        } elseif (($data['signer_type'] ?? null) === 'staff' && ! empty($data['assisting_staff_id'])) {
            $query->where('purpose', 'tablet_signer:user:'.$data['assisting_staff_id']);
        } else {
            $query->where('purpose', 'tablet_signer:user:'.$request->user()->id);
        }

        $log = $query->first();

        abort_unless($log, 422, 'Please verify the signer PIN before saving attendance.');
        $log->update(['used_at' => now()]);
    }

    private function rejectUnavailableVerificationMethod(array $data): void
    {
        if (($data['verification_method'] ?? null) === 'qr') {
            throw ValidationException::withMessages(['verification_method' => ['QR verification is not available yet.']]);
        }
    }

    private function validatedAttendanceSigner(Request $request, Child $child, array $data): array
    {
        $user = $request->user();

        if (in_array($data['signer_type'], ['guardian', 'parent'], true)) {
            abort_unless(! empty($data['guardian_id']), 422, 'Please choose an authorized guardian.');
            $guardian = $child->guardians()->where('guardians.id', $data['guardian_id'])->first();
            abort_unless($guardian, 403, 'This guardian is not linked to the selected child.');

            if ($user->role === 'parent' && $guardian->user_id) {
                abort_unless((int) $guardian->user_id === (int) $user->id, 403, 'Parents can only sign for their own linked children.');
            }

            $canPickup = (bool) ($guardian->pivot?->pickup_authorized ?? $guardian->can_pickup);
            abort_unless($canPickup, 403, 'This guardian is not authorized for pickup.');

            return [(int) $guardian->id, null, $guardian->name, $data['signer_type'] === 'parent' ? 'parent' : 'guardian'];
        }

        if ($data['signer_type'] === 'authorized_pickup') {
            abort_unless(! empty($data['pickup_authorization_id']), 422, 'Please choose an authorized pickup.');
            $pickup = DB::table('pickup_authorizations')
                ->where('id', $data['pickup_authorization_id'])
                ->where('child_id', $child->id)
                ->where('active', true)
                ->where(fn ($query) => $query->whereNull('expires_on')->orWhereDate('expires_on', '>=', now()->toDateString()))
                ->first();
            abort_unless($pickup, 403, 'This pickup person is not authorized for the selected child.');

            return [$pickup->guardian_id ? (int) $pickup->guardian_id : null, (int) $pickup->id, $pickup->authorized_name, 'authorized_pickup'];
        }

        abort_unless(in_array($user->role, [...$this->managerRoles, ...$this->staffRoles], true), 403, 'Only staff can sign as staff.');

        if (! empty($data['assisting_staff_id'])) {
            $staff = User::find($data['assisting_staff_id']);
            return [null, null, $staff?->name ?? $data['signer_name'], 'staff'];
        }

        return [null, null, $user->name, 'staff'];
    }

    private function storeAttendanceSignature(Child $child, string $signerName, array $data): array
    {
        $signatureData = $data['signature_data'] ?? null;

        if (is_string($signatureData) && str_starts_with($signatureData, 'data:image/png;base64,')) {
            $encoded = substr($signatureData, strlen('data:image/png;base64,'));
            $binary = base64_decode($encoded, true);
            abort_unless($binary !== false && strlen($binary) > 100, 422, 'Please capture a signature before saving attendance.');
            abort_unless(@getimagesizefromstring($binary) !== false, 422, 'Please capture a valid signature image before saving attendance.');

            $hash = hash('sha256', $binary);
            $path = 'attendance-signatures/'.$child->organization_id.'/'.$child->id.'/'.now()->format('YmdHis').'-'.Str::random(12).'.png';
            Storage::disk('local')->put($path, $binary);

            return [$path, $hash];
        }

        $source = $signatureData ?: ($data['signature_name'] ?? $signerName);

        return [$data['signature_reference'] ?? 'typed-signature', hash('sha256', $child->id.'|'.$signerName.'|'.$source.'|'.now()->toISOString())];
    }

    private function childPayload(Child $child): array
    {
        $latest = $child->attendanceRecords()->latest('date')->latest('check_in_time')->first();
        $guardianNames = $child->guardians->pluck('name')->values();
        return [
            'id' => (string) $child->id,
            'child_code' => $child->child_code,
            'childCode' => $child->child_code,
            'name' => trim($child->first_name.' '.$child->last_name),
            'firstName' => $child->first_name,
            'lastName' => $child->last_name,
            'dateOfBirth' => optional($child->date_of_birth)->toDateString(),
            'date_of_birth' => optional($child->date_of_birth)->toDateString(),
            'age' => $child->date_of_birth ? $child->date_of_birth->age.' years' : 'Unknown',
            'classroom' => $child->classroom?->name ?? (($child->organization?->facility_type ?? 'center_daycare') === 'family_child_care' ? 'Family child care' : 'Unassigned'),
            'classroomId' => $child->classroom_id,
            'guardianNames' => $guardianNames,
            'primaryGuardianName' => $guardianNames->first(),
            'allergies' => $child->allergies ?? [],
            'avatar' => strtoupper(substr($child->first_name, 0, 1).substr($child->last_name, 0, 1)),
            'attendanceStatus' => $latest && ! $latest->check_out_time ? 'checked_in' : 'checked_out',
        ];
    }

    private function guardianPayload(Guardian $guardian): array
    {
        $guardianStatus = $guardian->status ?? 'active';
        $pinConfigured = (bool) $guardian->pin_hash;

        return [
            'id' => (string) $guardian->id,
            'organization_id' => $guardian->organization_id,
            'user_id' => $guardian->user_id,
            'name' => $guardian->name,
            'email' => null,
            'phone' => $guardian->phone,
            'relationship' => $guardian->relationship,
            'can_pickup' => (bool) $guardian->can_pickup,
            'status' => $guardianStatus,
            'account_status' => 'not_required',
            'invite_status' => 'not_required',
            'pin_configured' => $pinConfigured,
            'tablet_unlock_ready' => $guardianStatus === 'active' && $pinConfigured,
            'children' => $guardian->children?->map(fn (Child $child) => [
                'id' => (string) $child->id,
                'name' => trim($child->first_name.' '.$child->last_name),
                'first_name' => $child->first_name,
                'last_name' => $child->last_name,
                'child_code' => $child->child_code,
                'childCode' => $child->child_code,
            ])->values() ?? [],
            'user' => $guardian->user ? [
                'id' => (string) $guardian->user->id,
                'name' => $guardian->user->name,
                'email' => $guardian->user->email,
                'role' => $guardian->user->role,
                'status' => $guardian->user->status,
            ] : null,
        ];
    }

    private function attendancePayload(AttendanceRecord $record): array
    {
        $status = $this->attendanceStatus($record);
        $timezone = $this->attendanceTimezone($record->organization_id);
        $checkInLocal = $record->check_in_time ? $record->check_in_time->copy()->timezone($timezone) : null;
        $checkOutLocal = $record->check_out_time ? $record->check_out_time->copy()->timezone($timezone) : null;
        return [
            'id' => (string) $record->id,
            'childId' => (string) $record->child_id,
            'childCode' => $record->child?->child_code,
            'child_code' => $record->child?->child_code,
            'childName' => trim($record->child?->first_name.' '.$record->child?->last_name),
            'classroom' => $record->classroom?->name ?? $record->child?->classroom?->name ?? (($record->child?->organization?->facility_type ?? 'center_daycare') === 'family_child_care' ? 'Family child care' : 'Unassigned'),
            'date' => optional($record->date)->toDateString(),
            'timezone' => $timezone,
            'checkInAt' => optional($record->check_in_time)->toISOString(),
            'checkOutAt' => optional($record->check_out_time)->toISOString(),
            'checkInLocal' => optional($checkInLocal)->toIso8601String(),
            'checkOutLocal' => optional($checkOutLocal)->toIso8601String(),
            'checkInTime' => optional($checkInLocal)->format('H:i'),
            'checkOutTime' => optional($checkOutLocal)->format('H:i'),
            'status' => $status,
            'statusLabel' => Str::headline($status),
            'signedBy' => $record->signer_name,
            'signerType' => $record->signer_type,
            'verificationMethod' => $record->verification_method,
            'guardianId' => $record->guardian_id,
            'pickupAuthorizationId' => $record->pickup_authorization_id,
            'assistingStaffId' => $record->assisting_staff_id,
            'assistingStaffName' => $record->assistingStaff?->name,
            'signatureReference' => $record->signature_reference,
            'hasSignature' => (bool) $record->signature_hash,
            'corrected' => (bool) $record->corrected,
            'locationFlagged' => (bool) $record->location_flagged,
            'locationVerified' => (bool) $record->location_verified,
            'locationRejectionReason' => $record->location_rejection_reason,
            'distanceMeters' => $record->distance_meters,
            'latitude' => $record->latitude ? (float) $record->latitude : null,
            'longitude' => $record->longitude ? (float) $record->longitude : null,
            'checkInLatitude' => $record->check_in_latitude ? (float) $record->check_in_latitude : null,
            'checkInLongitude' => $record->check_in_longitude ? (float) $record->check_in_longitude : null,
            'checkInDistanceMeters' => $record->check_in_distance_meters,
            'checkOutLatitude' => $record->check_out_latitude ? (float) $record->check_out_latitude : null,
            'checkOutLongitude' => $record->check_out_longitude ? (float) $record->check_out_longitude : null,
            'checkOutDistanceMeters' => $record->check_out_distance_meters,
        ];
    }

    private function attendanceStatus(AttendanceRecord $record): string
    {
        if ($record->check_in_time && ! $record->check_out_time) {
            $dayEnd = $this->attendanceDayEnd($record);
            $recordDate = optional($record->date)->toDateString();
            $now = Carbon::now($this->attendanceTimezone($record->organization_id));
            if ($recordDate && ($recordDate < $now->toDateString() || ($recordDate === $now->toDateString() && $now->format('H:i') > $dayEnd))) {
                return 'missing_checkout';
            }

            return 'checked_in';
        }
        if ($record->check_in_time && $record->check_out_time) {
            $dayEnd = $this->attendanceDayEnd($record);
            $checkout = $record->check_out_time->copy()->timezone($this->attendanceTimezone($record->organization_id));

            return $checkout->format('H:i') < $dayEnd ? 'checked_out_early' : 'checked_out';
        }

        return 'not_checked_in';
    }

    private function attendanceDayEnd(AttendanceRecord $record): string
    {
        $settings = OrganizationSetting::where('organization_id', $record->organization_id)->first();
        $configured = $settings?->attendance_policy['attendance_day_end_time'] ?? $settings?->attendance_policy['day_end_time'] ?? null;
        if (is_string($configured) && preg_match('/^\d{2}:\d{2}/', $configured)) {
            return substr($configured, 0, 5);
        }

        return '17:00';
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

    private function tabletChildren(Request $request, string $mode): Builder
    {
        $user = $request->user();
        $mode = in_array($mode, ['guardian', 'staff', 'admin'], true) ? $mode : $this->tabletModeForUser($user);
        $query = Child::query()->where('organization_id', $this->orgId($request));

        if ($mode === 'guardian') {
            abort(403, 'Parents and guardians do not unlock tablet mode. Ask provider staff to open the tablet and select them as signers.');
        } elseif ($mode === 'staff') {
            abort_unless(in_array($user->role, $this->staffRoles, true), 403, 'Staff mode requires a staff or teacher account.');
            if (($user->organization?->facility_type ?? 'center_daycare') === 'center_daycare') {
                $query->where('classroom_id', $user->staffProfile?->classroom_id);
            }
        } elseif ($mode === 'admin') {
            abort_unless(in_array($user->role, $this->managerRoles, true), 403, 'Admin mode requires a daycare admin or manager account.');
        }

        return $query;
    }

    private function tabletModeForUser(User $user): string
    {
        if ($user->role === 'parent') {
            return 'guardian';
        }
        if (in_array($user->role, $this->staffRoles, true)) {
            return 'staff';
        }
        return 'admin';
    }

    private function tabletScope(Request $request, string $mode): string
    {
        if ($mode === 'guardian') {
            return 'guardian_children';
        }
        if ($mode === 'staff') {
            return 'assigned_classroom';
        }
        return 'admin_all';
    }

    private function tabletScopeLabel(Request $request, string $mode): string
    {
        $user = $request->user();
        if ($mode === 'guardian') {
            return 'Guardian signer scope: provider tablet unlock required';
        }
        if ($mode === 'staff') {
            return 'Staff Mode: assigned classroom only'.($user->staffProfile?->classroom?->name ? ' - '.$user->staffProfile->classroom->name : '');
        }
        if (($user->organization?->facility_type ?? 'center_daycare') === 'family_child_care') {
            return 'Admin Mode: all family child care children';
        }
        return 'Admin Mode: all organization classrooms and children';
    }

    private function absencePayload(AbsenceRecord $absence): array
    {
        return [
            'id' => (string) $absence->id,
            'childId' => (string) $absence->child_id,
            'childCode' => $absence->child?->child_code,
            'child_code' => $absence->child?->child_code,
            'childName' => $absence->child ? trim($absence->child->first_name.' '.$absence->child->last_name) : 'Child',
            'classroomId' => $absence->classroom_id,
            'classroom' => $absence->classroom?->name ?? $absence->child?->classroom?->name ?? (($absence->child?->organization?->facility_type ?? 'center_daycare') === 'family_child_care' ? 'Family child care' : 'Unassigned'),
            'absenceDate' => optional($absence->absence_date)->toDateString(),
            'absence_date' => optional($absence->absence_date)->toDateString(),
            'absenceType' => $absence->absence_type,
            'absence_type' => $absence->absence_type,
            'reason' => $absence->reason,
            'notes' => $absence->notes,
            'status' => $absence->status,
            'enteredBy' => $absence->enteredBy?->name,
            'entered_by' => $absence->entered_by,
            'assistingStaffId' => $absence->assisting_staff_id,
            'assistingStaffName' => $absence->assistingStaff?->name,
            'createdAt' => optional($absence->created_at)->toDateTimeString(),
        ];
    }

    private function attendanceAuditPayload(AttendanceAuditLog $log): array
    {
        $record = $log->attendanceRecord;
        $timezone = $record ? $this->attendanceTimezone($record->organization_id) : 'Africa/Nairobi';
        $editedAtLocal = $log->edited_at ? $log->edited_at->copy()->timezone($timezone) : null;

        return [
            'id' => (string) $log->id,
            'attendance_record_id' => $log->attendance_record_id,
            'childName' => $record?->child ? trim($record->child->first_name.' '.$record->child->last_name) : 'Attendance record',
            'childCode' => $record?->child?->child_code,
            'classroom' => $record?->classroom?->name ?? $record?->child?->classroom?->name ?? (($record?->child?->organization?->facility_type ?? 'center_daycare') === 'family_child_care' ? 'Family child care' : 'Unassigned'),
            'date' => optional($record?->date)->toDateString(),
            'action' => $log->action,
            'reason' => $log->reason,
            'edited_by_user_id' => $log->edited_by_user_id,
            'editedBy' => $log->editedBy?->name,
            'editedByEmail' => $log->editedBy?->email,
            'edited_at' => optional($log->edited_at)->toDateTimeString(),
            'editedAtLocal' => optional($editedAtLocal)->toIso8601String(),
            'timezone' => $timezone,
        ];
    }

    private function invoicePayload(Invoice $invoice): array
    {
        return [
            'id' => $invoice->invoice_number,
            'databaseId' => $invoice->id,
            'childName' => $invoice->child ? trim($invoice->child->first_name.' '.$invoice->child->last_name) : 'General',
            'childCode' => $invoice->child?->child_code,
            'amount' => (float) $invoice->amount,
            'dueDate' => optional($invoice->due_date)->toDateString(),
            'status' => $invoice->status,
        ];
    }

    private function incidentPayload(IncidentReport $incident): array
    {
        return [
            'id' => (string) $incident->id,
            'childName' => trim($incident->child?->first_name.' '.$incident->child?->last_name),
            'childCode' => $incident->child?->child_code,
            'classroom' => $incident->classroom?->name ?? $incident->child?->classroom?->name ?? 'Unassigned',
            'severity' => $incident->severity,
            'status' => $incident->status,
            'summary' => $incident->summary,
            'occurredAt' => optional($incident->occurred_at)->toDateTimeString(),
            'staffName' => $incident->staff?->name ?? 'Staff',
        ];
    }

    private function dailyNotePayload(DailyChildNote $note): array
    {
        return [
            'id' => (string) $note->id,
            'child_id' => $note->child_id,
            'childName' => trim($note->child?->first_name.' '.$note->child?->last_name),
            'childCode' => $note->child?->child_code,
            'classroom' => $note->child?->classroom?->name ?? 'Unassigned',
            'date' => optional($note->date)->toDateString(),
            'note' => $note->note,
            'staff_user_id' => $note->staff_user_id,
        ];
    }

    private function documentPayload(Document $document): array
    {
        return [
            'id' => (string) $document->id,
            'title' => $document->title,
            'type' => $document->type,
            'path' => $document->path,
            'fileName' => $document->original_name,
            'original_name' => $document->original_name,
            'mimeType' => $document->mime_type,
            'mime_type' => $document->mime_type,
            'size' => $document->size,
            'downloadUrl' => url('/api/documents/'.$document->id.'/download'),
            'child_id' => $document->child_id,
            'childName' => $document->child ? trim($document->child->first_name.' '.$document->child->last_name) : null,
            'childCode' => $document->child?->child_code,
            'classroom' => $document->child?->classroom?->name,
            'created_at' => optional($document->created_at)->toDateTimeString(),
        ];
    }

    private function notificationPayload(Notification $notification): array
    {
        return [
            'id' => (string) $notification->id,
            'organization_id' => $notification->organization_id,
            'user_id' => $notification->user_id,
            'recipientRole' => $notification->recipient_role,
            'recipient_role' => $notification->recipient_role,
            'recipientName' => $notification->recipient?->name,
            'type' => $notification->type,
            'title' => $notification->title,
            'body' => $notification->body,
            'relatedModelType' => $notification->related_model_type,
            'related_model_type' => $notification->related_model_type,
            'relatedModelId' => $notification->related_model_id,
            'related_model_id' => $notification->related_model_id,
            'read_at' => optional($notification->read_at)->toDateTimeString(),
            'delivered_at' => optional($notification->delivered_at)->toDateTimeString(),
            'deliveryChannel' => $notification->delivery_channel,
            'delivery_channel' => $notification->delivery_channel,
            'deliveryStatus' => $notification->delivery_status,
            'delivery_status' => $notification->delivery_status,
            'priority' => $notification->priority,
            'createdByName' => $notification->creator?->name,
            'created_by' => $notification->created_by,
            'created_at' => optional($notification->created_at)->toDateTimeString(),
        ];
    }

    private function pricingPlanPayload(PricingPlan $plan): array
    {
        return [
            'id' => (string) $plan->id,
            'name' => $plan->name,
            'code' => $plan->code,
            'monthly_price' => (float) $plan->monthly_price,
            'yearly_price' => (float) ($plan->yearly_price ?? 0),
            'currency' => $plan->currency ?? 'USD',
            'child_limit' => $plan->child_limit,
            'staff_limit' => $plan->staff_limit,
            'device_limit' => $plan->device_limit,
            'features' => $plan->features ?? [],
            'status' => $plan->status ?? 'active',
            'featured' => (bool) ($plan->featured ?? false),
            'available_for_family_child_care' => (bool) ($plan->available_for_family_child_care ?? true),
            'available_for_center_daycare' => (bool) ($plan->available_for_center_daycare ?? true),
            'stripe_product_id' => $plan->stripe_product_id,
            'stripe_monthly_price_id' => $plan->stripe_monthly_price_id,
            'stripe_yearly_price_id' => $plan->stripe_yearly_price_id,
            'updated_at' => optional($plan->updated_at)->toDateTimeString(),
        ];
    }

    private function subscriptionPayload(Subscription $subscription): array
    {
        return [
            'id' => (string) $subscription->id,
            'organization_id' => $subscription->organization_id,
            'organization' => $subscription->organization,
            'pricing_plan_id' => $subscription->pricing_plan_id,
            'pricing_plan' => $subscription->pricingPlan,
            'status' => $subscription->status,
            'billing_cycle' => $subscription->billing_cycle ?? 'monthly',
            'provider' => $subscription->provider ?? 'manual',
            'current_period_start' => optional($subscription->current_period_start)->toDateTimeString(),
            'current_period_end' => optional($subscription->current_period_end ?? $subscription->current_period_ends_at)->toDateTimeString(),
            'trial_ends_at' => optional($subscription->trial_ends_at)->toDateTimeString(),
            'current_period_ends_at' => optional($subscription->current_period_ends_at)->toDateTimeString(),
            'next_invoice_at' => optional($subscription->next_invoice_at)->toDateTimeString(),
            'stripe_customer_id' => $subscription->stripe_customer_id,
            'stripe_subscription_id' => $subscription->stripe_subscription_id,
            'cancel_at_period_end' => (bool) $subscription->cancel_at_period_end,
            'canceled_at' => optional($subscription->canceled_at)->toDateTimeString(),
            'notes' => $subscription->notes,
        ];
    }

    private function platformInvoicePayload(PlatformInvoice $invoice): array
    {
        return [
            'id' => (string) $invoice->id,
            'organization_id' => $invoice->organization_id,
            'organization' => $invoice->organization,
            'subscription_id' => $invoice->subscription_id,
            'subscription' => $invoice->subscription ? $this->subscriptionPayload($invoice->subscription) : null,
            'invoice_number' => $invoice->invoice_number,
            'billing_period_start' => optional($invoice->billing_period_start)->toDateString(),
            'billing_period_end' => optional($invoice->billing_period_end)->toDateString(),
            'due_date' => optional($invoice->due_date)->toDateString(),
            'currency' => $invoice->currency,
            'subtotal' => (float) $invoice->subtotal,
            'tax_amount' => (float) $invoice->tax_amount,
            'discount_amount' => (float) $invoice->discount_amount,
            'total_amount' => (float) $invoice->total_amount,
            'amount_paid' => (float) $invoice->amount_paid,
            'balance_due' => (float) $invoice->balance_due,
            'status' => $invoice->status,
            'payment_method' => $invoice->payment_method,
            'stripe_invoice_id' => $invoice->stripe_invoice_id,
            'stripe_payment_intent_id' => $invoice->stripe_payment_intent_id,
            'paid_at' => optional($invoice->paid_at)->toDateTimeString(),
            'notes' => $invoice->notes,
            'payments' => $invoice->relationLoaded('payments') ? $invoice->payments->map(fn (PlatformPayment $payment) => $this->platformPaymentPayload($payment))->values() : [],
            'created_at' => optional($invoice->created_at)->toDateTimeString(),
        ];
    }

    private function platformPaymentPayload(PlatformPayment $payment): array
    {
        return [
            'id' => (string) $payment->id,
            'organization_id' => $payment->organization_id,
            'organization' => $payment->organization,
            'invoice_id' => $payment->invoice_id,
            'invoice_number' => $payment->invoice?->invoice_number,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'method' => $payment->method,
            'reference' => $payment->reference,
            'provider_payment_id' => $payment->provider_payment_id,
            'paid_at' => optional($payment->paid_at)->toDateTimeString(),
            'recorded_by' => $payment->recorded_by,
            'recorded_by_name' => $payment->recorder?->name,
            'notes' => $payment->notes,
            'created_at' => optional($payment->created_at)->toDateTimeString(),
        ];
    }

    private function invitationPayload(OrganizationInvitation $invitation): array
    {
        return [
            'id' => (string) $invitation->id,
            'organization_id' => $invitation->organization_id,
            'organization_name' => $invitation->organization?->name,
            'email' => $invitation->email,
            'name' => $invitation->name,
            'role' => $invitation->role,
            'status' => $invitation->status,
            'expires_at' => optional($invitation->expires_at)->toDateTimeString(),
            'accepted_at' => optional($invitation->accepted_at)->toDateTimeString(),
            'invite_url' => rtrim(config('app.daycare_web_url', 'http://localhost:5173'), '/').'/invite/'.$invitation->token,
            'token' => $invitation->token,
        ];
    }

    private function registrationApplicationPayload(FacilityRegistrationApplication $application): array
    {
        return [
            'id' => (string) $application->id,
            'facility_type' => $application->facility_type,
            'facility_type_label' => Str::headline($application->facility_type),
            'business_name' => $application->business_name,
            'legal_name' => $application->legal_name,
            'owner_name' => $application->owner_name,
            'owner_email' => $application->owner_email,
            'phone' => $application->phone,
            'city' => $application->city,
            'state' => $application->state,
            'country' => $application->country,
            'address' => $application->address,
            'latitude' => $application->latitude !== null ? (float) $application->latitude : null,
            'longitude' => $application->longitude !== null ? (float) $application->longitude : null,
            'attendance_radius_meters' => $application->attendance_radius_meters,
            'timezone' => $application->timezone,
            'license_number' => $application->license_number,
            'license_status' => $application->license_status,
            'pricing_plan_id' => $application->pricing_plan_id,
            'pricing_plan' => $application->pricingPlan ? $this->pricingPlanPayload($application->pricingPlan) : null,
            'billing_cycle' => $application->billing_cycle,
            'notes' => $application->notes,
            'status' => $application->status,
            'review_notes' => $application->review_notes,
            'organization_id' => $application->organization_id,
            'organization' => $application->organization ? $this->organizationPayload($application->organization) : null,
            'reviewed_by' => $application->reviewed_by,
            'reviewer_name' => $application->reviewer?->name,
            'reviewed_at' => optional($application->reviewed_at)->toDateTimeString(),
            'created_at' => optional($application->created_at)->toDateTimeString(),
        ];
    }

    private function createOrganizationFromApplication(Request $request, FacilityRegistrationApplication $application, PricingPlan $plan, string $billingCycle): array
    {
        $timezone = ($application->timezone && in_array($application->timezone, timezone_identifiers_list(), true))
            ? $application->timezone
            : 'Africa/Nairobi';
        $licenseNumber = trim((string) $application->license_number);
        $licenseStatus = $licenseNumber === '' ? ($application->license_status ?: 'not_provided') : ($application->license_status ?: 'pending');

        $organization = Organization::create([
            'name' => $application->business_name,
            'organization_code' => $this->generateOrganizationCode($application->business_name),
            'facility_type' => $application->facility_type,
            'legal_name' => $application->legal_name,
            'phone' => $application->phone,
            'email' => $application->owner_email,
            'address' => $application->address,
            'latitude' => $application->latitude,
            'longitude' => $application->longitude,
            'city' => $application->city,
            'state' => $application->state,
            'country' => $application->country,
            'timezone' => $timezone,
            'license_number' => $licenseNumber !== '' ? $licenseNumber : null,
            'license_status' => $licenseStatus,
            'status' => 'pending_setup',
            'plan' => $plan->name,
            'mrr' => 0,
            'approved_at' => null,
            'attendance_radius_meters' => $application->attendance_radius_meters ?: 100,
            'checkin_radius_meters' => $application->attendance_radius_meters ?: 100,
        ]);
        $this->updateOrganizationTimezone($organization, $timezone);

        $periodStart = now();
        $periodEnd = $billingCycle === 'yearly' ? now()->addYear() : now()->addMonth();
        $subscription = Subscription::create([
            'organization_id' => $organization->id,
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => $billingCycle,
            'status' => 'pending_activation',
            'provider' => 'manual',
            'current_period_start' => $periodStart,
            'current_period_end' => $periodEnd,
            'current_period_ends_at' => $periodEnd,
            'next_invoice_at' => $periodEnd,
            'notes' => 'Created from public facility registration application.',
        ]);

        $invitation = $this->createOrganizationInvitation($request, $organization, [
            'name' => $application->owner_name,
            'email' => $application->owner_email,
            'role' => 'daycare_admin',
        ]);
        $invoice = $this->ensureSubscriptionInvoice($subscription->fresh(['pricingPlan']));

        return [
            'organization' => $this->organizationPayload($organization->fresh()),
            'subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan'])),
            'invitations' => [$this->invitationPayload($invitation)],
            'invoice' => $invoice ? $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments'])) : null,
            'invite_note' => 'Owner/admin invitation email has been queued for delivery.',
        ];
    }

    private function validateFacilityPlanSelection(string $facilityType, PricingPlan $plan): void
    {
        if ($facilityType !== 'family_child_care') {
            return;
        }

        if (strtolower((string) $plan->code) !== 'starter' && strtolower((string) $plan->name) !== 'starter') {
            throw ValidationException::withMessages([
                'pricing_plan_id' => ['Family Child Care registration is available only on the Starter plan.'],
            ]);
        }
    }

    private function platformUserPayload(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'status' => $user->status,
            'organization_id' => $user->organization_id,
            'organization' => $user->organization,
            'created_at' => optional($user->created_at)->toDateTimeString(),
        ];
    }

    private function supportTicketPayload(SupportTicket $ticket): array
    {
        return [
            'id' => (string) $ticket->id,
            'subject' => $ticket->subject,
            'description' => $ticket->description,
            'status' => $ticket->status,
            'priority' => $ticket->priority,
            'organization_id' => $ticket->organization_id,
            'organization' => $ticket->organization,
            'opened_by' => $ticket->openedBy,
            'assigned_to' => $ticket->assigned_to,
            'assignee' => $ticket->assignee,
            'comments' => $ticket->comments?->map(fn ($comment) => [
                'id' => (string) $comment->id,
                'body' => $comment->body,
                'user' => $comment->user,
                'created_at' => optional($comment->created_at)->toDateTimeString(),
            ])->values() ?? [],
            'created_at' => optional($ticket->created_at)->toDateTimeString(),
            'updated_at' => optional($ticket->updated_at)->toDateTimeString(),
        ];
    }

    private function auditLogPayload(AuditLog $log): array
    {
        $targetName = null;
        if ($log->target_type === Organization::class) {
            $targetName = Organization::find($log->target_id)?->name;
        } elseif ($log->target_type === User::class) {
            $targetName = User::find($log->target_id)?->email;
        } elseif ($log->target_type === PricingPlan::class) {
            $targetName = PricingPlan::find($log->target_id)?->name;
        } elseif ($log->target_type === SupportTicket::class) {
            $targetName = SupportTicket::find($log->target_id)?->subject;
        } elseif ($log->target_type === SystemAlert::class) {
            $targetName = SystemAlert::find($log->target_id)?->title;
        } elseif ($log->target_type === PlatformInvoice::class) {
            $targetName = PlatformInvoice::find($log->target_id)?->invoice_number;
        } elseif ($log->target_type === PlatformPayment::class) {
            $targetName = PlatformPayment::find($log->target_id)?->reference;
        } elseif ($log->target_type === Subscription::class) {
            $targetName = optional(Subscription::with('organization')->find($log->target_id)?->organization)->name;
        }

        return [
            'id' => (string) $log->id,
            'action' => $log->action,
            'actorName' => $log->actor?->name ?? 'System',
            'actorEmail' => $log->actor?->email,
            'targetType' => class_basename((string) $log->target_type),
            'targetName' => $targetName,
            'target_id' => $log->target_id,
            'organization' => $log->organization?->name,
            'changes' => $log->changes,
            'ip_address' => $log->ip_address,
            'created_at' => optional($log->created_at)->toDateTimeString(),
        ];
    }

    private function validatePricingPlan(Request $request, bool $partial = false): array
    {
        $sometimes = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$sometimes, 'string', 'max:255'],
            'code' => ['sometimes', 'nullable', 'string', 'max:80'],
            'monthly_price' => [$sometimes, 'numeric', 'min:0'],
            'yearly_price' => ['sometimes', 'numeric', 'min:0'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'child_limit' => ['nullable', 'integer', 'min:0'],
            'staff_limit' => ['nullable', 'integer', 'min:0'],
            'device_limit' => ['nullable', 'integer', 'min:0'],
            'features' => ['sometimes', 'array'],
            'status' => ['sometimes', 'in:active,inactive'],
            'featured' => ['sometimes', 'boolean'],
            'available_for_family_child_care' => ['sometimes', 'boolean'],
            'available_for_center_daycare' => ['sometimes', 'boolean'],
            'stripe_product_id' => ['nullable', 'string', 'max:255'],
            'stripe_monthly_price_id' => ['nullable', 'string', 'max:255'],
            'stripe_yearly_price_id' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function setPlatformSubscriptionStatus(Request $request, Subscription $subscription, string $status, string $action): JsonResponse
    {
        $updates = ['status' => $status];
        if ($status === 'paused') {
            $updates['paused_at'] = now();
        }
        if ($status === 'canceled') {
            $updates['canceled_at'] = now();
        }
        if ($status === 'active') {
            $updates['paused_at'] = null;
            $updates['canceled_at'] = null;
        }
        $subscription->update($updates);
        $this->syncOrganizationBillingSummary($subscription->fresh(['pricingPlan']));
        $this->platformAudit($request, $action, $subscription, $updates);

        return response()->json(['subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan']))]);
    }

    private function recordPlatformPaymentForInvoice(Request $request, PlatformInvoice $invoice, array $data): PlatformPayment
    {
        $payment = PlatformPayment::create([
            'organization_id' => $invoice->organization_id,
            'invoice_id' => $invoice->id,
            'amount' => $data['amount'],
            'currency' => $invoice->currency,
            'method' => $data['method'] ?? 'manual',
            'reference' => $data['reference'] ?? null,
            'paid_at' => isset($data['paid_at']) ? Carbon::parse($data['paid_at']) : now(),
            'recorded_by' => $request->user()?->id,
            'notes' => $data['notes'] ?? null,
        ]);
        $invoice->update(['payment_method' => $payment->method]);
        $this->recalculatePlatformInvoice($invoice);

        return $payment;
    }

    private function recalculatePlatformInvoice(PlatformInvoice $invoice): void
    {
        $paid = (float) PlatformPayment::where('invoice_id', $invoice->id)->sum('amount');
        $total = (float) $invoice->total_amount;
        $balance = max(0, $total - $paid);
        $status = $balance <= 0 ? 'paid' : ($paid > 0 ? 'partial' : 'open');
        if ($status !== 'paid' && $invoice->due_date && $invoice->due_date->isPast()) {
            $status = 'overdue';
        }
        $invoice->update([
            'amount_paid' => min($paid, $total),
            'balance_due' => $balance,
            'status' => $status,
            'paid_at' => $status === 'paid' ? now() : null,
        ]);
        if ($invoice->subscription && $status === 'overdue') {
            $invoice->subscription->update(['status' => 'past_due']);
            $this->syncOrganizationBillingSummary($invoice->subscription->fresh(['pricingPlan']));
        }
        if ($invoice->subscription && $status === 'paid' && in_array($invoice->subscription->status, ['pending_activation', 'pending_payment', 'past_due'], true)) {
            $invoice->subscription->update(['status' => 'active']);
            $invoice->subscription->organization?->update(['status' => 'active', 'approved_at' => $invoice->subscription->organization?->approved_at ?? now()]);
            $freshSubscription = $invoice->subscription->fresh(['organization', 'pricingPlan']);
            $this->syncOrganizationBillingSummary($freshSubscription);
            $this->sendSubscriptionActivatedEmails($freshSubscription);
        }
    }

    private function sendSubscriptionActivatedEmails(Subscription $subscription): void
    {
        $admins = User::where('organization_id', $subscription->organization_id)
            ->whereIn('role', ['daycare_admin', 'manager'])
            ->where('status', 'active')
            ->get();
        foreach ($admins as $admin) {
            Mail::to($admin->email)->queue(new SubscriptionActivatedMail($subscription));
        }
    }

    private function refreshOverduePlatformInvoices(?int $organizationId = null): void
    {
        $query = PlatformInvoice::query()->whereIn('status', ['open', 'partial'])->where('due_date', '<', now()->toDateString())->where('balance_due', '>', 0);
        if ($organizationId) {
            $query->where('organization_id', $organizationId);
        }
        $query->get()->each(function (PlatformInvoice $invoice) {
            $invoice->update(['status' => 'overdue']);
            if ($invoice->subscription && $invoice->subscription->status === 'active') {
                $invoice->subscription->update(['status' => 'past_due']);
                $this->syncOrganizationBillingSummary($invoice->subscription->fresh(['pricingPlan']));
            }
        });
    }

    private function syncOrganizationBillingSummary(Subscription $subscription): void
    {
        $plan = $subscription->pricingPlan;
        if (! $subscription->organization || ! $plan) {
            return;
        }
        $mrr = $subscription->billing_cycle === 'yearly' ? ((float) $plan->yearly_price / 12) : (float) $plan->monthly_price;
        $subscription->organization->update([
            'plan' => $plan->name,
            'mrr' => in_array($subscription->status, ['active', 'trialing', 'trial'], true) ? $mrr : 0,
            'status' => $subscription->status === 'suspended' ? 'suspended' : ($subscription->organization->status === 'suspended' && $subscription->status === 'active' ? 'active' : $subscription->organization->status),
        ]);
    }

    private function isTestPaymentEnabled(): bool
    {
        return app()->environment(['local', 'testing']) || (bool) config('services.billing.test_payment_enabled', false);
    }

    /**
     * Find the org's open invoice and mark it as paid from a Stripe session.
     * Idempotent — skips if already paid or if this session's reference is
     * already recorded in payment history.
     */
    private function settleOpenInvoiceForSession(object $session, int $organizationId): void
    {
        $openInvoice = PlatformInvoice::where('organization_id', $organizationId)
            ->whereIn('status', ['open', 'partial', 'overdue'])
            ->oldest('due_date')
            ->first();

        if (! $openInvoice || (float) $openInvoice->balance_due <= 0) {
            return;
        }

        // Extract payment intent ID safely (may be an expanded object or a plain string).
        $piRaw = $session->payment_intent ?? null;
        $piId  = is_string($piRaw) ? $piRaw : ($piRaw?->id ?? null);

        // Use payment intent or session ID as the idempotency reference.
        $reference = $piId ?? $session->id;

        // Skip if this exact payment was already recorded to prevent double-payment.
        if (PlatformPayment::where('invoice_id', $openInvoice->id)->where('reference', $reference)->exists()) {
            return;
        }

        // amount_total is in cents; fall back to invoice balance if not present.
        $amountPaid = isset($session->amount_total) && $session->amount_total > 0
            ? round($session->amount_total / 100, 2)
            : (float) $openInvoice->balance_due;

        $fakeRequest = new Request();
        $this->recordPlatformPaymentForInvoice($fakeRequest, $openInvoice, [
            'amount'    => min($amountPaid, (float) $openInvoice->balance_due),
            'method'    => 'stripe_live',
            'reference' => $reference,
            'paid_at'   => now(),
            'notes'     => 'Stripe payment (session: '.$session->id.')',
        ]);

        if ($piId) {
            $openInvoice->update(['stripe_payment_intent_id' => $piId]);
        }
    }

    private function ensureSubscriptionInvoice(Subscription $subscription): ?PlatformInvoice
    {
        $plan = $subscription->pricingPlan;
        if (! $plan) {
            return null;
        }

        $amount = (float) $plan->monthly_price;
        if ($amount <= 0) {
            return null;
        }

        // Strict deduplication: one unpaid invoice per subscription.
        // Also match invoices that have no subscription_id set (legacy rows).
        $existing = PlatformInvoice::where('organization_id', $subscription->organization_id)
            ->where(function ($q) use ($subscription) {
                $q->where('subscription_id', $subscription->id)
                  ->orWhereNull('subscription_id');
            })
            ->whereIn('status', ['open', 'partial', 'overdue'])
            ->oldest('due_date')
            ->first();

        if ($existing) {
            // Backfill subscription_id if missing.
            $updates = [];
            if (! $existing->subscription_id) {
                $updates['subscription_id'] = $subscription->id;
            }
            if ((float) $existing->total_amount !== $amount) {
                $updates['subtotal']      = $amount;
                $updates['total_amount']  = $amount;
                $updates['balance_due']   = max(0, $amount - (float) $existing->amount_paid);
                $updates['notes']         = $plan->name.' Plan - Monthly Subscription';
            }
            if ($updates) {
                $existing->update($updates);
            }
            return $existing->fresh();
        }

        return PlatformInvoice::create([
            'organization_id'      => $subscription->organization_id,
            'subscription_id'      => $subscription->id,
            'invoice_number'       => 'PLAT-'.now()->format('YmdHis').'-'.Str::upper(Str::random(4)),
            'billing_period_start' => now()->toDateString(),
            'billing_period_end'   => optional($subscription->current_period_end)->toDateString() ?? now()->addMonth()->toDateString(),
            'due_date'             => now()->addDays(7)->toDateString(),
            'currency'             => $plan->currency ?? 'USD',
            'subtotal'             => $amount,
            'total_amount'         => $amount,
            'balance_due'          => $amount,
            'status'               => 'open',
            'payment_method'       => 'manual',
            'notes'                => $plan->name.' Plan - Monthly Subscription',
        ]);
    }

    public function generateOrgInvoice(Request $request, Organization $organization)
    {
        $subscription = Subscription::with('pricingPlan')
            ->where('organization_id', $organization->id)
            ->latest()
            ->first();

        abort_unless($subscription, 422, 'This organization has no subscription to invoice.');
        abort_unless($subscription->pricingPlan, 422, 'The subscription has no plan assigned.');

        $invoice = $this->ensureSubscriptionInvoice($subscription);
        abort_unless($invoice, 422, 'Could not generate an invoice. Check that the plan has a price set.');

        $this->platformAudit($request, 'platform_invoice.manually_generated', $organization, [
            'invoice_id' => $invoice->id,
            'amount' => $invoice->total_amount,
        ]);

        return response()->json([
            'invoice' => $this->platformInvoicePayload($invoice->fresh(['organization', 'subscription.pricingPlan', 'payments'])),
            'message' => 'Invoice generated successfully.',
        ], 201);
    }

    private function createOrganizationInvitation(Request $request, Organization $organization, array $data): OrganizationInvitation
    {
        OrganizationInvitation::where('organization_id', $organization->id)
            ->where('email', $data['email'])
            ->where('status', 'pending')
            ->update(['status' => 'cancelled']);

        $invitation = OrganizationInvitation::create([
            'organization_id' => $organization->id,
            'user_id' => $data['user_id'] ?? null,
            'email' => $data['email'],
            'name' => $data['name'],
            'role' => $data['role'] ?? 'daycare_admin',
            'token' => Str::random(64),
            'status' => 'pending',
            'expires_at' => now()->addDays(14),
            'invited_by' => $request->user()?->id,
        ]);

        $invitation->load('organization');
        Mail::to($invitation->email)->queue(new OrganizationInvitationMail($invitation));

        return $invitation;
    }

    private function queuePasswordReset(User $user): string
    {
        return Password::sendResetLink(
            ['email' => $user->email],
            function (User $resetUser, string $token) {
                $resetUrl = rtrim($this->passwordResetFrontendUrl($resetUser), '/')
                    .'/reset-password?token='.$token.'&email='.urlencode($resetUser->email);

                Mail::queue('emails.password-reset', ['resetUrl' => $resetUrl], function ($message) use ($resetUser) {
                    $message->to($resetUser->email)->subject('Reset your Barbaari password');
                });
            }
        );
    }

    private function passwordResetFrontendUrl(User $user): string
    {
        if ($user->hasAnyRole(['super_admin', 'support_staff']) || $user->role === 'super_admin') {
            return config('app.super_admin_web_url', 'http://localhost:5174');
        }

        return config('app.daycare_web_url', config('app.frontend_url', 'http://localhost:5173'));
    }

    private function createOrganizationLoginUser(Organization $organization, array $data): User
    {
        $role = $data['role'] ?? 'daycare_admin';
        $user = User::create([
            'organization_id' => $organization->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role' => $role,
            'status' => 'active',
            'password' => Hash::make($data['password']),
            'email_verified_at' => now(),
        ]);
        $roleModel = Role::where('name', $role)->first();
        if ($roleModel) {
            $user->roles()->sync([$roleModel->id]);
        }
        if (in_array($role, ['teacher', 'staff'], true)) {
            StaffProfile::create([
                'organization_id' => $organization->id,
                'user_id' => $user->id,
                'title' => Str::title(str_replace('_', ' ', $role)),
            ]);
        }

        return $user;
    }

    private function updateOrganizationTimezone(Organization $organization, string $timezone): void
    {
        $settings = OrganizationSetting::firstOrNew(['organization_id' => $organization->id]);
        $attendancePolicy = $settings->attendance_policy ?? [];
        $attendancePolicy['attendance_timezone'] = $timezone;
        $settings->attendance_policy = $attendancePolicy;
        $settings->billing_settings = $settings->billing_settings ?? ['currency' => 'USD', 'invoice_day' => 1];
        $settings->notification_settings = $settings->notification_settings ?? ['email' => true, 'sms' => false];
        $settings->save();
    }

    private function platformAudit(Request $request, string $action, mixed $target = null, array $changes = []): void
    {
        AuditLog::create([
            'organization_id' => $target instanceof Organization ? $target->id : null,
            'actor_id' => $request->user()?->id,
            'action' => $action,
            'target_type' => is_object($target) ? $target::class : null,
            'target_id' => is_object($target) && isset($target->id) ? $target->id : null,
            'changes' => $changes,
            'ip_address' => $request->ip(),
        ]);
    }

    private function organizationPayload(Organization $org): array
    {
        $subscription = Subscription::with('pricingPlan')->where('organization_id', $org->id)->latest()->first();
        $balanceDue = PlatformInvoice::where('organization_id', $org->id)->whereIn('status', ['open', 'partial', 'overdue'])->sum('balance_due');

        return [
            'id' => (string) $org->id,
            'name' => $org->name,
            'organization_code' => $org->organization_code,
            'organizationCode' => $org->organization_code,
            'facility_type' => $org->facility_type ?? 'center_daycare',
            'facilityType' => $org->facility_type ?? 'center_daycare',
            'facility_type_label' => Str::headline($org->facility_type ?? 'center_daycare'),
            'legal_name' => $org->legal_name,
            'status' => $org->status,
            'licenseNumber' => $org->license_number,
            'license_number' => $org->license_number,
            'license_status' => $org->license_status ?? ($org->license_number ? 'pending' : 'not_provided'),
            'city' => $org->city,
            'state' => $org->state,
            'country' => $org->country,
            'timezone' => $org->timezone ?: $this->attendanceTimezone($org->id),
            'phone' => $org->phone,
            'email' => $org->email,
            'website' => $org->website,
            'address' => $org->address,
            'children' => $org->children_count ?? $org->children()->count(),
            'staff' => $org->staff_count ?? $org->users()->whereIn('role', ['staff', 'teacher', 'manager', 'daycare_admin'])->count(),
            'users_count' => $org->users()->count(),
            'primary_admin_email' => $org->users()->where('role', 'daycare_admin')->oldest()->value('email'),
            'plan' => $org->plan,
            'mrr' => (float) $org->mrr,
            'subscription_status' => $subscription?->status,
            'current_plan' => $subscription?->pricingPlan?->name ?? $org->plan,
            'balance_due' => (float) $balanceDue,
            'next_invoice_at' => optional($subscription?->next_invoice_at)->toDateTimeString(),
            'overdue' => PlatformInvoice::where('organization_id', $org->id)->where('status', 'overdue')->exists(),
            'latitude' => $org->latitude ? (float) $org->latitude : null,
            'longitude' => $org->longitude ? (float) $org->longitude : null,
            'attendance_radius_meters' => (int) ($org->attendance_radius_meters ?? $org->checkin_radius_meters ?? 100),
            'checkin_radius_meters' => (int) ($org->attendance_radius_meters ?? $org->checkin_radius_meters ?? 100),
        ];
    }

    private function attendanceTrend(int $orgId): array
    {
        return collect(range(4, 0))->map(function ($days) use ($orgId) {
            $date = Carbon::today()->subDays($days);
            return [
                'day' => $date->format('D'),
                'present' => AttendanceRecord::where('organization_id', $orgId)->whereDate('date', $date)->count(),
                'absent' => max(0, Child::where('organization_id', $orgId)->count() - AttendanceRecord::where('organization_id', $orgId)->whereDate('date', $date)->count()),
            ];
        })->values()->all();
    }

    private function syncNamedRole(User $user, string $roleName): void
    {
        $role = \App\Models\Role::firstOrCreate(['name' => $roleName], ['label' => str($roleName)->replace('_', ' ')->title()]);
        $user->roles()->sync([$role->id]);
    }

    private function generateChildCode(int $organizationId): string
    {
        $organization = Organization::find($organizationId);
        if ($organization && ! $organization->organization_code) {
            $organization->update(['organization_code' => $this->generateOrganizationCode($organization->name)]);
            $organization->refresh();
        }
        $prefix = $organization?->organization_code ?: $this->generateOrganizationCode($organization?->name ?? 'Barbaari');
        $sequence = Child::where('organization_id', $organizationId)->count() + 1;

        do {
            $code = sprintf('%s-CH-%04d', $prefix, $sequence++);
        } while (Child::where('child_code', $code)->exists());

        return $code;
    }

    private function generateOrganizationCode(string $name): string
    {
        $base = $this->organizationPrefix($name);
        $sequence = 1;
        do {
            $code = sprintf('%s%02d', $base, $sequence++);
        } while (Organization::where('organization_code', $code)->exists());

        return $code;
    }

    private function organizationPrefix(?string $name): string
    {
        $letters = collect(preg_split('/\s+/', trim((string) $name)) ?: [])
            ->filter()
            ->map(fn ($word) => Str::upper(Str::substr(preg_replace('/[^A-Za-z]/', '', $word), 0, 1)))
            ->filter()
            ->take(3)
            ->implode('');

        return strlen($letters) >= 2 ? str_pad($letters, 3, 'C') : 'BAR';
    }

    // =========================================================
    // Feature: Location Safety
    // =========================================================

    private function calculateLocationData(int $organizationId, ?float $lat, ?float $lng, string $direction, Child $child, User $actor): array
    {
        if ($lat === null || $lng === null) {
            $message = 'Device location is required for attendance. Allow location access and try again.';
            $this->auditLocationRejection($organizationId, $child, $actor, $direction, $message);
            throw ValidationException::withMessages(['location' => [$message]]);
        }

        $org = Organization::find($organizationId);
        if (! $org || $org->latitude === null || $org->longitude === null) {
            $message = 'Daycare attendance location is not configured. Ask an admin to set the daycare location before recording attendance.';
            $this->auditLocationRejection($organizationId, $child, $actor, $direction, $message);
            throw ValidationException::withMessages(['location' => [$message]]);
        }

        $distance = $this->haversineDistance((float) $org->latitude, (float) $org->longitude, $lat, $lng);
        $radius = (int) ($org->attendance_radius_meters ?? $org->checkin_radius_meters ?? 100);
        $roundedDistance = (int) round($distance);
        if ($distance > $radius) {
            $message = "Attendance blocked: device is approximately {$roundedDistance}m from the daycare center, outside the allowed {$radius}m radius.";
            $this->auditLocationRejection($organizationId, $child, $actor, $direction, $message, $roundedDistance, $radius);
            $this->notifyLocationRejection($org, $child, $actor, $direction, $roundedDistance, $radius);
            throw ValidationException::withMessages(['location' => [$message]]);
        }

        $prefix = $direction === 'check_out' ? 'check_out' : 'check_in';

        return [
            'latitude' => $lat,
            'longitude' => $lng,
            'distance_meters' => $roundedDistance,
            'location_flagged' => false,
            "{$prefix}_latitude" => $lat,
            "{$prefix}_longitude" => $lng,
            "{$prefix}_distance_meters" => $roundedDistance,
            'location_verified' => true,
            'location_rejection_reason' => null,
        ];
    }

    private function haversineDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    private function notifyLocationAlert(AttendanceRecord $record, Child $child, User $actor, string $direction): void
    {
        $childName = trim($child->first_name.' '.$child->last_name);
        $distanceMeters = $record->distance_meters;
        $directionLabel = $direction === 'check_in' ? 'Check-in' : 'Check-out';
        $title = "{$directionLabel} recorded outside daycare premises";
        $body = "{$childName} was {$directionLabel}-d by {$actor->name} from approximately {$distanceMeters}m away from the registered daycare location.";

        $admins = User::where('organization_id', $record->organization_id)
            ->whereIn('role', ['daycare_admin', 'manager'])
            ->where('status', 'active')
            ->get();

        foreach ($admins as $admin) {
            $this->notifications->createForUser($admin, [
                'organization_id' => $record->organization_id,
                'type' => 'location_alert',
                'title' => $title,
                'body' => $body,
                'related_model_type' => AttendanceRecord::class,
                'related_model_id' => $record->id,
                'priority' => 'high',
                'created_by' => $actor->id,
            ]);
        }
    }

    private function auditLocationRejection(int $organizationId, Child $child, User $actor, string $direction, string $reason, ?int $distanceMeters = null, ?int $radiusMeters = null): void
    {
        AuditLog::create([
            'organization_id' => $organizationId,
            'actor_id' => $actor->id,
            'action' => 'attendance.location_rejected',
            'target_type' => Child::class,
            'target_id' => $child->id,
            'changes' => [
                'child_id' => $child->id,
                'direction' => $direction,
                'reason' => $reason,
                'distance_meters' => $distanceMeters,
                'radius_meters' => $radiusMeters,
            ],
            'ip_address' => request()?->ip(),
        ]);
    }

    private function notifyLocationRejection(Organization $organization, Child $child, User $actor, string $direction, int $distanceMeters, int $radiusMeters): void
    {
        $childName = trim($child->first_name.' '.$child->last_name);
        $directionLabel = $direction === 'check_out' ? 'check-out' : 'check-in';
        $admins = User::where('organization_id', $organization->id)
            ->whereIn('role', ['daycare_admin', 'manager'])
            ->where('status', 'active')
            ->get();

        foreach ($admins as $admin) {
            $this->notifications->createForUser($admin, [
                'organization_id' => $organization->id,
                'type' => 'location_rejected',
                'title' => 'Attendance blocked outside daycare radius',
                'body' => "{$childName} {$directionLabel} was blocked for {$actor->name}; device was {$distanceMeters}m away from a {$radiusMeters}m allowed radius.",
                'related_model_type' => Child::class,
                'related_model_id' => $child->id,
                'priority' => 'high',
                'created_by' => $actor->id,
            ]);
        }
    }

    public function updateOrganizationLocation(Request $request, Organization $organization)
    {
        $data = $request->validate([
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'checkin_radius_meters' => ['nullable', 'integer', 'min:25', 'max:10000'],
            'attendance_radius_meters' => ['nullable', 'integer', 'min:25', 'max:10000'],
        ]);
        if (array_key_exists('attendance_radius_meters', $data)) {
            $data['checkin_radius_meters'] = $data['attendance_radius_meters'];
        } elseif (array_key_exists('checkin_radius_meters', $data)) {
            $data['attendance_radius_meters'] = $data['checkin_radius_meters'];
        }
        $organization->update(array_filter($data, fn ($v) => $v !== null));
        $this->platformAudit($request, 'organization.location_updated', $organization, $data);

        return response()->json(['organization' => $this->organizationPayload($organization->fresh())]);
    }

    public function organizationLocationAlerts(Request $request, Organization $organization)
    {
        $records = AttendanceRecord::with('child', 'classroom')
            ->where('organization_id', $organization->id)
            ->where('location_flagged', true)
            ->latest()
            ->limit(200)
            ->get();

        return response()->json([
            'location_alerts' => $records->map(fn (AttendanceRecord $r) => [
                'id' => (string) $r->id,
                'childName' => trim($r->child?->first_name.' '.$r->child?->last_name),
                'classroom' => $r->classroom?->name ?? $r->child?->classroom?->name ?? 'Unassigned',
                'signedBy' => $r->signer_name,
                'distanceMeters' => $r->distance_meters,
                'latitude' => $r->latitude ? (float) $r->latitude : null,
                'longitude' => $r->longitude ? (float) $r->longitude : null,
                'date' => optional($r->date)->toDateString(),
                'checkInAt' => optional($r->check_in_time)->toISOString(),
                'checkOutAt' => optional($r->check_out_time)->toISOString(),
            ])->values(),
        ]);
    }

    // =========================================================
    // Feature: PDF Invoices
    // =========================================================

    public function downloadInvoicePdf(Request $request, PlatformInvoice $invoice)
    {
        abort_unless($invoice->organization_id === $this->orgId($request), 403);

        return $this->buildInvoicePdf($invoice);
    }

    public function downloadPlatformInvoicePdf(Request $request, PlatformInvoice $invoice)
    {
        return $this->buildInvoicePdf($invoice);
    }

    public function downloadPlatformPaymentReceiptPdf(Request $request, PlatformPayment $payment)
    {
        $payment->load('organization', 'invoice.subscription.pricingPlan', 'recorder');
        abort_unless($payment->invoice, 404, 'Payment receipt is not available.');

        $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('pdf.receipt', ['payment' => $payment]);
        $filename = 'receipt-'.$payment->invoice->invoice_number.'-'.$payment->id.'.pdf';

        return $pdf->download($filename);
    }

    private function buildInvoicePdf(PlatformInvoice $invoice): \Illuminate\Http\Response
    {
        $invoice->load('organization', 'subscription.pricingPlan', 'payments');
        $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('pdf.invoice', ['invoice' => $invoice]);
        $filename = 'invoice-'.$invoice->invoice_number.'.pdf';

        return $pdf->download($filename);
    }

    // =========================================================
    // Feature: Stripe Recurring Billing
    // =========================================================

    public function cancelStripeSubscription(Request $request)
    {
        $subscription = Subscription::with('organization', 'pricingPlan')
            ->where('organization_id', $this->orgId($request))
            ->latest()
            ->first();

        abort_unless($subscription, 422, 'No subscription found.');
        abort_unless(in_array($subscription->status, ['active', 'trialing', 'past_due'], true), 422, 'Subscription is not in a cancellable state.');

        if ($subscription->stripe_subscription_id && $this->stripe->isConfigured()) {
            try {
                $this->stripe->cancelSubscription($subscription->stripe_subscription_id, atPeriodEnd: true);
            } catch (\Stripe\Exception\ApiErrorException $e) {
                return response()->json(['message' => 'Stripe cancellation failed: '.$e->getMessage()], 422);
            }
        }

        $subscription->update([
            'cancel_at_period_end' => true,
            'canceled_at' => now(),
        ]);
        $this->platformAudit($request, 'subscription.cancel_requested', $subscription->organization, ['subscription_id' => $subscription->id]);

        return response()->json([
            'message' => 'Subscription cancellation scheduled. Access continues until '.optional($subscription->current_period_end)->format('F j, Y').'.',
            'subscription' => $this->subscriptionPayload($subscription->fresh(['organization', 'pricingPlan'])),
        ]);
    }

    // =========================================================
    // Feature: Billing Analytics
    // =========================================================

    public function billingAnalyticsOverview()
    {
        $now = now();
        $startOfMonth = $now->copy()->startOfMonth();
        $startOfLastMonth = $now->copy()->subMonth()->startOfMonth();
        $endOfLastMonth = $now->copy()->subMonth()->endOfMonth();

        $totalRevenue = (float) PlatformPayment::sum('amount');
        $revenueThisMonth = (float) PlatformPayment::where('paid_at', '>=', $startOfMonth)->sum('amount');
        $revenueLastMonth = (float) PlatformPayment::whereBetween('paid_at', [$startOfLastMonth, $endOfLastMonth])->sum('amount');

        $statusCounts = Subscription::selectRaw('status, count(*) as count')->groupBy('status')->pluck('count', 'status');

        return response()->json([
            'total_revenue' => $totalRevenue,
            'revenue_this_month' => $revenueThisMonth,
            'revenue_last_month' => $revenueLastMonth,
            'active_subscriptions' => (int) ($statusCounts['active'] ?? 0),
            'past_due_subscriptions' => (int) ($statusCounts['past_due'] ?? 0),
            'cancelled_subscriptions' => (int) ($statusCounts['canceled'] ?? 0),
            'new_subscriptions_this_month' => Subscription::where('created_at', '>=', $startOfMonth)->count(),
        ]);
    }

    public function billingAnalyticsRevenueByMonth()
    {
        $months = collect(range(11, 0))->map(function (int $offset) {
            $date = now()->subMonths($offset)->startOfMonth();

            return [
                'month' => $date->format('Y-m'),
                'revenue' => (float) PlatformPayment::whereBetween('paid_at', [
                    $date->copy()->startOfMonth(),
                    $date->copy()->endOfMonth(),
                ])->sum('amount'),
            ];
        })->values()->all();

        return response()->json(['revenue_by_month' => $months]);
    }

    public function billingAnalyticsTopOrganizations()
    {
        $top = PlatformPayment::with('organization')
            ->selectRaw('organization_id, SUM(amount) as total_paid, MAX(paid_at) as last_payment_date')
            ->groupBy('organization_id')
            ->orderByDesc('total_paid')
            ->limit(10)
            ->get()
            ->map(function ($row) {
                $subscription = Subscription::where('organization_id', $row->organization_id)->latest()->first();

                return [
                    'organization_id' => $row->organization_id,
                    'org_name' => $row->organization?->name ?? 'Unknown',
                    'total_paid' => (float) $row->total_paid,
                    'subscription_status' => $subscription?->status ?? 'none',
                    'last_payment_date' => optional($row->last_payment_date)->toDateTimeString(),
                ];
            })->values()->all();

        return response()->json(['top_organizations' => $top]);
    }
}
