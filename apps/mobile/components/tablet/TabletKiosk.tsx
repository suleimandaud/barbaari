import { useEffect, useMemo, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_ATTENDANCE_TIMEZONE, formatAttendanceTime } from "@barbaari/shared";
import { SubscriptionRequiredScreen } from "../SubscriptionRequiredScreen";
import { useKioskFlow } from "../../hooks/useKioskFlow";
import { absenceTypes, statusFor } from "../../services/kioskLogic";
import { t } from "./theme";
import {
  Avatar, BrandPanel, Field, Icon, InlineAlert, PinPad, SearchField, Segmented, SignaturePad, StatusPill, StepBar, T, TabletFonts, TButton, logo
} from "./ui";

/*
 * Tablet kiosk — design/tablet-redesign ("Barbaari Tablet Kiosk", iPad landscape
 * 1024×768; portrait stacks the same panels). Rendered by app/kiosk.tsx on tablets only.
 *
 * Every action runs through useKioskFlow, the same state machine the phone kiosk uses:
 * tablet unlock (role-based mode), tablet bootstrap, signer list, signer PIN verification,
 * online + device-location checks, and the real check-in / check-out / absence calls.
 */
export function TabletKiosk() {
  return <TabletFonts><KioskScreens /></TabletFonts>;
}

type Problem = { title: string; message?: string } | null;

function firstName(name?: string | null) {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

function shortName(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] ?? "";
}

/** 12-hour time in the daycare's timezone ("8:31 AM"), as in the design. */
function clockText(date: Date, timezone?: string, options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }) {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone ?? DEFAULT_ATTENDANCE_TIMEZONE }).format(date);
  } catch {
    return formatAttendanceTime(date, timezone ?? DEFAULT_ATTENDANCE_TIMEZONE);
  }
}

function useClock(timezone?: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return clockText(now, timezone);
}

function KioskScreens() {
  const [problem, setProblem] = useState<Problem>(null);
  const flow = useKioskFlow((title, message) => setProblem({ title, message }));
  const { width, height } = useWindowDimensions();
  const landscape = width >= height && width >= 900;
  const { step } = flow;

  // A problem belongs to the screen it happened on.
  useEffect(() => { setProblem(null); }, [step]);

  const problemBanner = problem ? <InlineAlert title={problem.title} message={problem.message} onDismiss={() => setProblem(null)} /> : null;

  if (step === "confirm" && flow.confirmation) return <DoneScreen flow={flow} />;

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {step === "welcome" ? <UnlockScreen flow={flow} landscape={landscape} problem={problemBanner} /> : null}
        {step === "subscription" ? (
          <ScrollView contentContainerStyle={styles.page}>
            <View style={styles.topBar}>
              <Brandmark label="Tablet mode" detail="Subscription required" />
              <TButton compact variant="secondary" icon="lock-outline" label="Lock" onPress={flow.lockTablet} />
            </View>
            <SubscriptionRequiredScreen onBack={() => { flow.setStep("welcome"); flow.setUnlocked(false); flow.setUnlockedUser(null); flow.setData(null); }} />
          </ScrollView>
        ) : null}
        {(step === "classroom" || step === "child") && flow.data ? <ChildScreen flow={flow} landscape={landscape} problem={problemBanner} /> : null}
        {step === "action" ? <ActionScreen flow={flow} landscape={landscape} problem={problemBanner} /> : null}
        {(step === "signer" || step === "verify") ? <SignerScreen flow={flow} landscape={landscape} problem={problemBanner} /> : null}
        {step === "signature" ? <SignatureScreen flow={flow} landscape={landscape} problem={problemBanner} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Flow = ReturnType<typeof useKioskFlow>;
type ScreenProps = { flow: Flow; landscape: boolean; problem: React.ReactNode };

function Brandmark({ label, detail }: { label: string; detail?: string }) {
  return (
    <View style={styles.brandmark}>
      <Image source={logo} style={{ width: 40, height: 40, borderRadius: t.radiusSm }} accessibilityLabel="Barbaari" />
      <T size={17} weight="semibold">{label}</T>
      {detail ? <T size={16} color={t.neutral700} numberOfLines={1} style={{ flexShrink: 1 }}>{detail}</T> : null}
    </View>
  );
}

/* ---------------------------------------------------------------- 3a · unlock */

function UnlockScreen({ flow, landscape, problem }: ScreenProps) {
  const organization = flow.unlockedUser?.organization?.name ?? flow.user?.organization?.name;
  const panel = (
    <BrandPanel
      horizontal={!landscape}
      eyebrow={organization ? `${organization} · Front desk` : "Barbaari attendance"}
      title="Tablet mode is locked"
      body="Parents and guardians: please ask a staff member to open the tablet. You’ll sign with your own PIN."
    />
  );

  // Unlocked, but the attendance records didn't load (network or permission problem).
  if (flow.unlocked) {
    return (
      <View style={[styles.split, !landscape && styles.stack]}>
        {panel}
        <View style={styles.unlockSide}>
          <View style={{ width: "100%", maxWidth: 440, gap: 20 }}>
            {problem}
            {flow.loadError ? <InlineAlert title="Attendance records didn’t load" message={flow.loadError} /> : null}
            <T size={26} weight="semibold">Unlocked by {flow.unlockedUser?.name ?? flow.user?.name ?? "staff"}</T>
            <TButton label={flow.data?.uses_classrooms === false || flow.data?.facility_type === "family_child_care" ? "Continue to children" : "Load attendance"} icon="refresh" busy={flow.saving} onPress={() => flow.loadTabletData(flow.mode)} />
            <TButton variant="secondary" icon="lock-outline" label="Lock tablet" onPress={flow.lockTablet} />
          </View>
        </View>
      </View>
    );
  }

  const canSubmit = !!flow.email.trim() && flow.pin.length > 0;

  // Email sign-in is the only unlock form. One field takes the password or the tablet PIN:
  // admins/managers may use either, staff/teacher accounts unlock with their PIN (backend rule).
  return (
    <View style={[styles.split, !landscape && styles.stack]}>
      {panel}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.unlockSide} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 400, gap: 22 }}>
          <View style={{ gap: 6 }}>
            <T size={30} weight="semibold">Staff sign in</T>
            <T size={17} color={t.neutral800}>Sign in with your daycare email to open the tablet.</T>
          </View>
          {problem}
          {flow.loadError ? <InlineAlert title="Attendance records didn’t load" message={flow.loadError} /> : null}
          <Field label="Email" value={flow.email} onChangeText={flow.setEmail} placeholder="name@daycare.com" keyboardType="email-address" autoComplete="email" />
          <Field label="Password or PIN" value={flow.pin} onChangeText={flow.setPin} secure autoComplete="password" />
          <TButton label={flow.saving ? "Signing in…" : "Sign in"} icon="lock-open-variant-outline" busy={flow.saving} disabled={!canSubmit} onPress={() => flow.unlockWithPin({ roleMode: true })} />
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------------------------------------------------------------- 3b · choose child */

function ChildScreen({ flow, landscape, problem }: ScreenProps) {
  const [query, setQuery] = useState("");
  const data = flow.data!;
  const clock = useClock(data.timezone);
  const usesClassrooms = data.uses_classrooms !== false && data.facility_type !== "family_child_care" && data.facilityType !== "family_child_care";
  // The phone layout asks for a classroom first; the tablet design filters in place.
  const rooms = usesClassrooms && data.classrooms.length > 1 ? data.classrooms : [];
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flow.classroomChildren.filter((child) => !q || String(child.name).toLowerCase().includes(q) || String(child.childCode ?? child.child_code ?? "").toLowerCase().includes(q));
  }, [flow.classroomChildren, query]);
  const columns = landscape ? 4 : 3;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <Brandmark label={flow.unlockedUser?.organization?.name ?? "Front desk"} detail={`Unlocked by ${shortName(flow.unlockedUser?.name ?? flow.user?.name)}${flow.mode === "staff" ? " · staff mode" : ""}`} />
        <View style={styles.topRight}>
          {flow.saving ? <T size={16} color={t.neutral700}>Loading…</T> : null}
          <T size={17}>{clock}</T>
          <TButton compact variant="secondary" icon="lock-outline" label="Lock" onPress={flow.lockTablet} />
        </View>
      </View>
      <T size={40} weight="semibold" style={{ marginBottom: 26, lineHeight: 48 }}>Who’s arriving or leaving?</T>
      {problem}
      <View style={[styles.filters, !landscape && { flexDirection: "column", alignItems: "stretch" }]}>
        <View style={{ flex: 1 }}><SearchField value={query} onChangeText={setQuery} placeholder="Search by child’s name" /></View>
        {rooms.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <Segmented
              label="Classroom"
              value={flow.selectedClassroomId || "all"}
              onChange={(key) => { flow.setSelectedClassroomId(key === "all" ? "" : key); flow.setClassroomScopeChosen(true); }}
              items={[{ key: "all", label: "All" }, ...rooms.map((room) => ({ key: String(room.id), label: String(room.name).replace(/ Room$/, "") }))]}
            />
          </ScrollView>
        ) : null}
      </View>
      {list.length ? (
        <View style={styles.grid}>
          {list.map((child) => {
            const status = statusFor(child, data.attendance, data.absences, data.localDate ?? "");
            return (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={`${child.name}, ${status}`}
                disabled={flow.saving}
                onPress={() => flow.selectChild(child)}
                style={({ pressed }) => [styles.tile, { width: `${100 / columns}%` as const }, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.tileInner, flow.selectedChildId === String(child.id) && flow.saving && { borderColor: t.accent }]}>
                  <Avatar name={child.name} seed={child.id} size={76} />
                  <T size={19} weight="semibold" center numberOfLines={2}>{child.name}</T>
                  <StatusPill status={status} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Icon name={query ? "magnify-close" : "account-search-outline"} size={48} />
          <T size={25} weight="semibold">{query ? "No child found" : "No children here"}</T>
          <T size={17} color={t.neutral800}>{query ? "Check the spelling, or choose All rooms." : "Choose another room, or ask an admin to assign children to this tablet."}</T>
        </View>
      )}
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- 3c · action */

function ActionScreen({ flow, landscape, problem }: ScreenProps) {
  const child = flow.selectedChild;
  const clock = useClock(flow.data?.timezone);
  const status = flow.selectedChildStatus;
  const name = firstName(child?.name);
  if (!child || !status) return null;
  const canIn = flow.visibleActions.includes("in");
  const canOut = flow.visibleActions.includes("out");
  const canAbsent = flow.visibleActions.includes("absent");

  function choose(action: "in" | "out" | "absent") {
    flow.setSelectedAction(action);
    flow.setStep("signer");
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StepBar current={1} onBack={flow.startOver} right={<T size={17}>{clock}</T>} />
      {problem}
      <View style={styles.childHead}>
        <Avatar name={child.name} seed={child.id} size={landscape ? 120 : 104} />
        <View style={{ flex: 1, gap: 8 }}>
          <T size={landscape ? 52 : 44} weight="semibold" style={{ lineHeight: landscape ? 58 : 50 }}>{child.name}</T>
          <T size={20} color={t.neutral800}>{[flow.data?.facility_type === "family_child_care" ? "Family child care" : child.classroom, child.age && child.age !== "Unknown" ? child.age : null].filter(Boolean).join(" · ")}</T>
          <StatusPill status={status} large />
        </View>
      </View>
      {flow.visibleActions.length ? (
        <View style={[styles.actions, !landscape && { flexDirection: "column" }]}>
          {canIn ? <ActionTile primary icon="login" label="Check in" onPress={() => choose("in")} disabled={flow.saving} /> : null}
          {canOut ? <ActionTile primary icon="logout" label="Check out" onPress={() => choose("out")} disabled={flow.saving} /> : null}
          {canAbsent ? <ActionTile icon="minus-circle-outline" label="Mark absent" onPress={() => choose("absent")} disabled={flow.saving} /> : null}
        </View>
      ) : (
        <InlineAlert tone="info" title={status === "absent" ? `${name} was already marked absent today.` : `${name}’s attendance for today is already complete.`} message="No further tablet action is available. Choose another child." />
      )}
      {flow.visibleActions.length ? (
        <View style={styles.note}>
          <Icon name="information-outline" size={20} color={t.neutral700} />
          <T size={16} color={t.neutral800}>{canOut ? `${name} is checked in, so check out is shown.` : `Check out appears once ${name} is checked in.`}</T>
        </View>
      ) : null}
    </ScrollView>
  );
}

function ActionTile({ icon, label, primary, onPress, disabled }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; primary?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, primary ? { flex: 1.4, backgroundColor: pressed ? t.accent600 : t.accent, borderColor: t.accent } : { flex: 1, backgroundColor: pressed ? t.neutral200 : "transparent" }, disabled && { opacity: 0.45 }]}
    >
      <Icon name={icon} size={46} color={primary ? t.white : t.text} />
      <T size={28} weight="semibold" color={primary ? t.white : t.text}>{label}</T>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- 3d · signer + PIN */

function SignerScreen({ flow, landscape, problem }: ScreenProps) {
  const child = flow.selectedChild;
  const name = firstName(child?.name);
  const action = flow.selectedAction;
  const signer = flow.selectedSigner;
  const verb = action === "in" ? `Checking in ${name}` : action === "out" ? `Checking out ${name}` : `${name} absent`;
  const title = action === "in" ? `Who is dropping ${name} off?` : action === "out" ? `Who is picking ${name} up?` : `Who is reporting ${name}’s absence?`;
  const guardians = flow.signers.filter((item) => item.type !== "staff" && item.type !== "admin");
  const staff = flow.signers.filter((item) => item.type === "staff" || item.type === "admin");

  function pick(item: any) {
    flow.setPin("");
    flow.chooseSigner(`${item.type}:${item.id}`);
    flow.setStep("verify");
  }

  const row = (item: any) => {
    const key = `${item.type}:${item.id}`;
    const isStaff = item.type === "staff" || item.type === "admin";
    const blocked = !isStaff && !item.can_pickup;
    const selected = flow.selectedSignerKey === key;
    const detail = blocked ? `${item.relationship ?? "Guardian"} · not authorized for pickup` : item.pin_configured ? `${item.relationship ?? (isStaff ? "Staff" : item.type)} · PIN set` : `${item.relationship ?? (isStaff ? "Staff" : "Guardian")} · no tablet PIN yet`;
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: blocked }}
        accessibilityLabel={`${item.name}, ${detail}`}
        disabled={blocked}
        onPress={() => pick(item)}
        style={[styles.signer, isStaff && styles.signerOutline, selected && styles.signerOn, (blocked || !item.pin_configured) && { opacity: 0.6 }]}
      >
        {isStaff ? <View style={{ width: 56, alignItems: "center" }}><Icon name="badge-account-horizontal-outline" size={34} /></View> : <Avatar name={item.name} seed={key} size={56} />}
        <View style={{ flex: 1, gap: 2 }}>
          <T size={20} weight="semibold" numberOfLines={1}>{item.name}</T>
          <T size={16} color={blocked || !item.pin_configured ? t.warn.fg : t.neutral800} numberOfLines={1}>{isStaff ? `Staff-assisted · ${detail}` : detail}</T>
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <StepBar current={2} onBack={() => { flow.setPin(""); flow.setStep("action"); }} right={<T size={17}>{verb}</T>} />
      {problem}
      <View style={[styles.split2, !landscape && { flexDirection: "column", alignItems: "stretch", gap: 36 }]}>
        <View style={[{ gap: 12 }, landscape && { flex: 1.25 }]}>
          <T size={34} weight="semibold" style={{ marginBottom: 10, lineHeight: 42 }}>{title}</T>
          {guardians.map(row)}
          {staff.map(row)}
          {!flow.signers.length ? <InlineAlert tone="warn" title="No authorized signers" message="No guardian, pickup person or staff member can sign for this child yet." /> : null}
        </View>
        <View style={[{ alignItems: "center" }, landscape ? { flex: 1, minHeight: 420 } : { paddingBottom: 20 }]}>
          {!signer ? (
            <View style={styles.padPlaceholder}>
              <Icon name="gesture-tap" size={40} color={t.neutral600} />
              <T size={18} color={t.neutral800} center>Choose who is signing, then enter their PIN here.</T>
            </View>
          ) : !signer.pin_configured ? (
            <View style={styles.padPlaceholder}>
              <Icon name="key-remove" size={40} color={t.warn.fg} />
              <T size={20} weight="semibold" center>{firstName(signer.name)} doesn’t have a tablet PIN yet</T>
              <T size={17} color={t.neutral800} center>Ask an admin to set one from Staff access or Guardians, or choose another signer.</T>
            </View>
          ) : (
            <View style={{ gap: 26, alignItems: "center", width: "100%" }}>
              <PinPad title={`${firstName(signer.name)}, enter your PIN`} value={flow.pin} onChange={flow.setPin} keySize={landscape ? 100 : 96} />
              <TButton label={flow.saving ? "Checking PIN…" : "Continue"} iconRight="arrow-right" busy={flow.saving} disabled={!/^\d{4,8}$/.test(flow.pin)} onPress={flow.verifySelectedSignerPin} style={{ alignSelf: "center", width: 328, maxWidth: "100%" }} />
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- 3e · signature (+ absence) */

function SignatureScreen({ flow, landscape, problem }: ScreenProps) {
  const child = flow.selectedChild;
  const signer = flow.selectedSigner;
  const name = firstName(child?.name);
  const action = flow.selectedAction;
  const clearRef = useRef<() => void>(() => undefined);
  const when = clockText(new Date(), flow.data?.timezone, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  const title = action === "absent" ? `Mark ${name} absent today` : `Sign to check ${action === "in" ? "in" : "out"} ${name}`;
  const confirmLabel = action === "absent" ? "Confirm absence" : `Confirm check-${action === "in" ? "in" : "out"}`;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" scrollEnabled={action === "absent" || !landscape}>
      <StepBar current={3} onBack={() => { flow.setPoints([]); flow.setStep("verify"); }} right={<View style={styles.verified}><Icon name="check-circle-outline" size={20} color={t.ok.fg} /><T size={17} color={t.ok.fg}>PIN verified</T></View>} />
      {problem}
      <T size={34} weight="semibold" style={{ lineHeight: 42 }}>{title}</T>
      <T size={19} color={t.neutral800} style={{ marginTop: 6, marginBottom: 24 }}>{[signer?.name, signer?.relationship, when].filter(Boolean).join(" · ")}</T>
      {action === "absent" ? (
        <View style={{ gap: 18, marginBottom: 24 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Segmented label="Absence type" value={flow.absenceType} onChange={flow.setAbsenceType} items={absenceTypes.map(([key, label]) => ({ key, label }))} />
          </ScrollView>
          <Field label="Reason" value={flow.absenceReason} onChangeText={flow.setAbsenceReason} placeholder="e.g. parent reported child is sick" autoCapitalize="sentences" />
          <Field label="Notes (optional)" value={flow.absenceNotes} onChangeText={flow.setAbsenceNotes} autoCapitalize="sentences" multiline />
        </View>
      ) : null}
      <SignaturePad
        height={action === "absent" ? 260 : landscape ? 400 : 460}
        onPoint={flow.addPoint}
        onLayoutBox={(box) => { flow.signatureBox.current = box; }}
        onClearRef={(clear) => { clearRef.current = clear; }}
      />
      <View style={styles.signActions}>
        <TButton variant="secondary" icon="eraser" label="Clear" onPress={() => { clearRef.current(); flow.setPoints([]); }} />
        <TButton icon="checkbox-marked-outline" label={flow.saving ? "Saving…" : confirmLabel} busy={flow.saving} disabled={flow.points.length < 4} onPress={flow.submitAttendance} style={{ minWidth: 296 }} />
      </View>
      {action !== "absent" ? <T size={15} color={t.neutral700} style={{ marginTop: 14 }}>Your location is checked when you confirm, to make sure attendance is recorded at the daycare.</T> : null}
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- 3f · done */

function DoneScreen({ flow }: { flow: Flow }) {
  const confirmation = flow.confirmation!;
  const [seconds, setSeconds] = useState(5);
  // useKioskFlow returns to the child list 5s after a save; this only shows the countdown.
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  const action = String(confirmation.action);
  const childFirst = firstName(confirmation.child);
  const heading = confirmation.absenceType ? `${childFirst} is marked absent` : `${childFirst} is ${action === "Check in" ? "checked in" : "checked out"}`;
  const room = flow.data?.facility_type === "family_child_care" ? null : flow.data?.children.find((item) => item.name === confirmation.child)?.classroom;

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={[styles.safe, { backgroundColor: t.brand }]}>
      <View style={styles.done} accessibilityLiveRegion="polite">
        <View style={styles.doneCheck}><Icon name="check-bold" size={80} color={t.brand} /></View>
        <T size={58} weight="semibold" color={t.white} center style={{ lineHeight: 64 }}>{heading}</T>
        <T size={22} color={t.white} center>{[confirmation.at ? clockText(new Date(confirmation.at), flow.data?.timezone) : confirmation.time, room, `signed by ${confirmation.signer}`].filter(Boolean).join(" · ")}</T>
        <T size={17} color={t.white} center style={{ opacity: 0.92 }}>{confirmation.absenceType ? `${confirmation.absenceType} · verified with PIN and signature` : "Verified with PIN and signature"}</T>
        <TButton variant="light" label="Next child" onPress={flow.startOver} style={{ marginTop: 14, minWidth: 180 }} />
        <T size={16} color={t.white} center style={{ opacity: 0.92 }}>Returning to the child list in {seconds} second{seconds === 1 ? "" : "s"}</T>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  page: { paddingHorizontal: 30, paddingTop: 18, paddingBottom: 40, flexGrow: 1 },
  split: { flex: 1, flexDirection: "row" },
  stack: { flexDirection: "column" },
  unlockSide: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingVertical: 36 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 30 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 18 },
  brandmark: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  filters: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -8 },
  tile: { padding: 8 },
  tileInner: { minHeight: 188, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 22, paddingHorizontal: 12, backgroundColor: t.surface, borderRadius: t.radius, borderWidth: 2, borderColor: "transparent" },
  empty: { gap: 14, paddingVertical: 50, maxWidth: 560 },
  childHead: { flexDirection: "row", alignItems: "center", gap: 30, marginBottom: 40, marginLeft: 30 },
  actions: { flexDirection: "row", gap: 20, marginHorizontal: 30 },
  actionTile: { minHeight: 190, alignItems: "center", justifyContent: "center", gap: 14, borderRadius: t.radius, borderWidth: 2, borderColor: t.divider, padding: 20 },
  note: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 28, marginHorizontal: 30 },
  split2: { flexDirection: "row", gap: 60, alignItems: "flex-start" },
  signer: { flexDirection: "row", alignItems: "center", gap: 18, minHeight: 84, paddingHorizontal: 20, paddingVertical: 12, borderRadius: t.radius, borderWidth: 2, borderColor: "transparent", backgroundColor: t.surface },
  signerOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: t.divider },
  signerOn: { borderWidth: 2, borderColor: t.accent, backgroundColor: t.accent100 },
  padPlaceholder: { alignItems: "center", justifyContent: "center", gap: 14, maxWidth: 360, paddingTop: 60 },
  verified: { flexDirection: "row", alignItems: "center", gap: 8 },
  signActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 22 },
  done: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 40 },
  doneCheck: { width: 150, height: 150, borderRadius: 75, backgroundColor: t.white, alignItems: "center", justifyContent: "center", marginBottom: 12 }
});
