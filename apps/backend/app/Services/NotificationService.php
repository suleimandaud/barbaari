<?php

namespace App\Services;

use App\Models\AttendanceRecord;
use App\Models\AbsenceRecord;
use App\Models\Child;
use App\Models\DailyChildNote;
use App\Models\Document;
use App\Models\IncidentReport;
use App\Models\Invoice;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

class NotificationService
{
    public function createForUser(User $user, array $payload): Notification
    {
        $channel = $payload['delivery_channel'] ?? 'in_app';

        return Notification::create([
            'organization_id' => $payload['organization_id'] ?? $user->organization_id,
            'user_id' => $user->id,
            'recipient_role' => $user->role,
            'type' => $payload['type'] ?? 'announcement',
            'title' => $payload['title'],
            'body' => $payload['body'] ?? null,
            'related_model_type' => $payload['related_model_type'] ?? null,
            'related_model_id' => $payload['related_model_id'] ?? null,
            'delivered_at' => $channel === 'in_app' ? now() : null,
            'delivery_channel' => $channel,
            'delivery_status' => $channel === 'in_app' ? 'delivered' : 'pending',
            'priority' => $payload['priority'] ?? 'normal',
            'created_by' => $payload['created_by'] ?? null,
        ]);
    }

    public function createForUsers(iterable $users, array $payload): Collection
    {
        return collect($users)
            ->filter(fn ($user) => $user instanceof User)
            ->unique('id')
            ->values()
            ->map(fn (User $user) => $this->createForUser($user, $payload));
    }

    public function notifyParentChildCheckedIn(Child $child, AttendanceRecord $record, ?User $actor = null): Collection
    {
        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'child_checked_in',
            'title' => $child->first_name.' checked in',
            'body' => trim($child->first_name.' '.$child->last_name).' was checked in at '.optional($record->check_in_time)->format('H:i').'.',
            'related_model_type' => AttendanceRecord::class,
            'related_model_id' => $record->id,
            'priority' => 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyParentChildCheckedOut(Child $child, AttendanceRecord $record, ?User $actor = null): Collection
    {
        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'child_checked_out',
            'title' => $child->first_name.' checked out',
            'body' => trim($child->first_name.' '.$child->last_name).' was checked out at '.optional($record->check_out_time)->format('H:i').'.',
            'related_model_type' => AttendanceRecord::class,
            'related_model_id' => $record->id,
            'priority' => 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyParentAbsenceRecorded(AbsenceRecord $absence, ?User $actor = null): Collection
    {
        $child = $absence->child;
        if (! $child) return collect();

        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'absence_recorded',
            'title' => $child->first_name.' marked absent',
            'body' => trim($child->first_name.' '.$child->last_name).' was marked absent for '.optional($absence->absence_date)->toDateString().' ('.str_replace('_', ' ', $absence->absence_type).').',
            'related_model_type' => AbsenceRecord::class,
            'related_model_id' => $absence->id,
            'priority' => in_array($absence->absence_type, ['no_show', 'unexcused'], true) ? 'high' : 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyParentIncidentCreated(IncidentReport $incident, ?User $actor = null): Collection
    {
        $child = $incident->child;
        if (! $child) return collect();

        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'incident_created',
            'title' => 'Incident report shared',
            'body' => $incident->summary,
            'related_model_type' => IncidentReport::class,
            'related_model_id' => $incident->id,
            'priority' => in_array($incident->severity, ['high', 'critical'], true) ? 'high' : 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyParentDailyNoteCreated(DailyChildNote $note, ?User $actor = null): Collection
    {
        $child = $note->child;
        if (! $child) return collect();

        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'daily_note_created',
            'title' => 'New daily note',
            'body' => str($note->note)->limit(140)->toString(),
            'related_model_type' => DailyChildNote::class,
            'related_model_id' => $note->id,
            'priority' => 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyParentInvoiceCreated(Invoice $invoice, ?User $actor = null): Collection
    {
        $child = $invoice->child;
        if (! $child) return collect();

        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'invoice_created',
            'title' => 'New invoice available',
            'body' => 'A new invoice for $'.number_format((float) $invoice->amount, 2).' is due on '.optional($invoice->due_date)->toDateString().'.',
            'related_model_type' => Invoice::class,
            'related_model_id' => $invoice->id,
            'priority' => 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyParentPaymentRecorded(Invoice $invoice, ?User $actor = null): Collection
    {
        $child = $invoice->child;
        if (! $child) return collect();

        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'payment_recorded',
            'title' => 'Payment recorded',
            'body' => 'A payment was recorded for invoice '.$invoice->invoice_number.'.',
            'related_model_type' => Invoice::class,
            'related_model_id' => $invoice->id,
            'priority' => 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyParentDocumentUploaded(Document $document, ?User $actor = null): Collection
    {
        $child = $document->child;
        if (! $child) return collect();

        return $this->createForUsers($this->parentUsersForChild($child), [
            'type' => 'document_uploaded',
            'title' => 'New document uploaded',
            'body' => $document->title.' is now available in documents.',
            'related_model_type' => Document::class,
            'related_model_id' => $document->id,
            'priority' => 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    public function notifyMessageReceived(Message $message, ?User $actor = null): Collection
    {
        $conversation = $message->conversation;
        if (! $conversation) return collect();

        $senderRole = $actor?->role;
        $roles = $senderRole === 'parent'
            ? ['daycare_admin', 'manager', 'staff', 'teacher']
            : ['parent'];

        $users = User::where('organization_id', $conversation->organization_id)
            ->whereIn('role', $roles)
            ->where('id', '!=', $message->sender_id)
            ->get();

        return $this->createForUsers($users, [
            'organization_id' => $conversation->organization_id,
            'type' => 'message_received',
            'title' => 'New message',
            'body' => str($message->body)->limit(140)->toString(),
            'related_model_type' => Message::class,
            'related_model_id' => $message->id,
            'priority' => 'normal',
            'created_by' => $actor?->id,
        ]);
    }

    private function parentUsersForChild(Child $child): EloquentCollection
    {
        return User::whereIn('id', $child->guardians()->whereNotNull('user_id')->pluck('guardians.user_id'))->get();
    }
}
