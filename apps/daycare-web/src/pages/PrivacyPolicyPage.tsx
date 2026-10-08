import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LogoTile } from "@barbaari/shared/web/ui";

/*
 * Public privacy policy for the Barbaari tablet / kiosk (/privacy-policy) — no login
 * required. Every statement describes what the tablet attendance app and the tablet site
 * actually do; update this page (and LAST_UPDATED) whenever that changes.
 */
const LAST_UPDATED = "October 8, 2026";
const CONTACT_EMAIL = "dhismopioneer@gmail.com";

const sections = [
  { id: "who-we-are", title: "Who we are" },
  { id: "what-we-collect", title: "Information the tablet uses" },
  { id: "how-we-use", title: "How we use information" },
  { id: "location", title: "Device location" },
  { id: "sharing", title: "Who we share information with" },
  { id: "security", title: "Tablet access and security" },
  { id: "retention", title: "Data retention" },
  { id: "deletion", title: "Account and data deletion" },
  { id: "children", title: "Children’s information" },
  { id: "choices", title: "Your choices and rights" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact us" }
];

export function PrivacyPolicyPage() {
  useEffect(() => { document.title = "Privacy Policy | Barbaari"; }, []);

  return (
    <div className="bb-legal-shell">
      <header className="bb-legal-top">
        <Link to="/" className="bb-gate-brand" style={{ textDecoration: "none", color: "inherit" }}>
          <LogoTile size={36} />
          <strong>Barbaari</strong>
        </Link>
        <Link className="bb-btn bb-btn-secondary" to="/login">Sign in</Link>
      </header>

      <main className="bb-legal">
        <div className="bb-legal-head">
          <p className="bb-overline accent">Legal</p>
          <h1>Privacy Policy</h1>
          <p className="bb-legal-updated">Last updated: <time dateTime="2026-10-08">{LAST_UPDATED}</time></p>
          <p className="bb-lede">
            This policy explains what information the Barbaari tablet app uses when a daycare runs its front-desk attendance
            tablet (kiosk), why it is used, and the choices you have.
          </p>
        </div>

        <nav className="bb-legal-toc" aria-label="On this page">
          <p className="bb-overline">On this page</p>
          <ol>{sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
        </nav>

        <section id="who-we-are">
          <h2>1. Who we are</h2>
          <p>
            Barbaari (“Barbaari”, “we”, “us”) provides the Barbaari tablet app, an attendance kiosk used by daycare centers and
            family child care providers (“daycares”) at their entrance. A staff member unlocks the tablet, and guardians and staff
            use it to record a child’s check-in, check-out or absence.
          </p>
          <p>
            The daycare decides which children, guardians, authorized pickup people and staff are set up for its tablet. The daycare
            is responsible for those records, and Barbaari stores and processes them on the daycare’s behalf to provide the tablet
            service. If you are a parent or guardian with a question about what your daycare has recorded, you can contact your
            daycare directly or contact us.
          </p>
        </section>

        <section id="what-we-collect">
          <h2>2. Information the tablet uses</h2>
          <p>The tablet only uses the information needed for the daycare’s attendance workflow described below.</p>

          <h3>Account and authentication information</h3>
          <ul>
            <li>Daycare administrators can unlock the Barbaari tablet using their email address and password. Staff members, parents, and authorized pickup persons cannot unlock the daycare tablet.</li>
            <li>Staff members, parents, and authorized pickup persons use their 4-digit PIN to confirm specific attendance actions, such as checking a child in or out. Their PIN is not used to unlock the tablet.</li>
            <li>The person’s name, role, and relationship to the child are used to determine which attendance actions and information they are authorized to access.</li>
          </ul>

          <h3>Child information</h3>
          <p>Entered beforehand by authorized daycare administrators and managers, and shown on the tablet so the right child can be chosen:</p>
          <ul>
            <li>Child name, child code, classroom, age and today’s attendance status.</li>
          </ul>

          <h3>Guardians and signers</h3>
          <ul>
            <li>The guardians, authorized pickup people and staff who may sign for a child: their name, relationship to the child, whether they are allowed to pick up, and whether a tablet PIN has been set.</li>
            <li>The signer’s tablet PIN, entered on the tablet to confirm their identity. It is checked by Barbaari’s servers against the stored one-way hash and is not kept on the tablet.</li>
          </ul>

          <h3>Attendance records</h3>
          <ul>
            <li>Check-in and check-out times and absences (absence type, reason and notes).</li>
            <li>Who signed each record (the guardian, authorized pickup person or staff member), how it was verified, and which staff account had the tablet unlocked.</li>
          </ul>

          <h3>Device location during attendance</h3>
          <p>
            The tablet’s precise location (GPS coordinates) when a check-in, check-out or absence is submitted, as described in
            <a href="#location"> Device location</a> below.
          </p>

          <h3>Signer name and signature</h3>
          <ul>
            <li>The signer’s name and a record of the signature drawn on the tablet screen to confirm a drop-off, pickup or absence.</li>
          </ul>

          <h3>Tablet security logs</h3>
          <ul>
            <li>Tablet unlock attempts and signer PIN checks, including whether they succeeded, the time and the IP address of the request.</li>
          </ul>

          <h3>What the tablet does not collect</h3>
          <p>
            The Barbaari tablet app does not show advertising, does not sell personal information, and does not include third-party
            analytics or advertising trackers. It does not access the camera, microphone or contacts, and it does not collect
            location in the background.
          </p>
        </section>

        <section id="how-we-use">
          <h2>3. How we use information</h2>
          <ul>
            <li>To let an authorized staff member unlock the tablet and to show only the children that person is allowed to see.</li>
            <li>To record check-ins, check-outs and absences in the daycare’s attendance records.</li>
            <li>To verify who is dropping off or picking up a child, using the signer’s tablet PIN and signature, and to block people who are not authorized to pick up.</li>
            <li>To confirm that attendance is recorded at the daycare, using the tablet’s location at the moment of submission.</li>
            <li>To keep the tablet secure: enforce role permissions, keep each daycare’s data separate from other daycares, limit repeated PIN or password attempts, and investigate misuse.</li>
            <li>To provide support when you contact us, and to meet legal and regulatory obligations.</li>
          </ul>
          <p>We do not use the information to show advertising, and we do not sell it.</p>
        </section>

        <section id="location">
          <h2>4. Device location</h2>
          <p>
            Daycares can require attendance to be recorded at their registered address. When a check-in, check-out or absence is
            submitted on the tablet, the Barbaari tablet app asks the tablet for its current precise location at that moment.
          </p>
          <ul>
            <li>The coordinates are compared with the daycare’s registered location and allowed radius. If the tablet is outside that area, the attendance action is not saved.</li>
            <li>The coordinates and the distance from the daycare are stored with the attendance record so the daycare can confirm where it was recorded.</li>
            <li>Location is requested only while the tablet app is in use and only when an attendance action is submitted. Barbaari does not track location in the background or between attendance actions.</li>
          </ul>
          <p>
            Location access can be turned off in the tablet’s settings or browser settings. If it is off, attendance actions that
            require location verification cannot be completed on that tablet.
          </p>
        </section>

        <section id="sharing">
          <h2>5. Who we share information with</h2>
          <p>We share information only as needed to provide the tablet service:</p>
          <ul>
            <li><strong>Your daycare and its authorized users.</strong> Attendance records made on the tablet are available to the daycare’s administrators and staff, limited by their role and, for staff, by their assigned classroom.</li>
            <li><strong>Service providers that run the service for us,</strong> such as our hosting provider. They may only use the information to provide their service to us.</li>
            <li><strong>Barbaari support staff,</strong> when needed to operate the service or help with a support request.</li>
            <li><strong>When required by law,</strong> or to protect the safety of children, users or the public, or to protect our rights.</li>
            <li><strong>In a business transfer,</strong> such as a merger or acquisition, under a privacy commitment at least as protective as this policy.</li>
          </ul>
          <p>We do not sell personal information and we do not share it with advertisers or data brokers.</p>
        </section>

        <section id="security">
          <h2>6. Tablet access and security</h2>
          <ul>
            <li>The tablet stays locked until an authorized daycare administrator, manager, staff member or teacher unlocks it. Parents and guardians cannot unlock the tablet; they only sign with their own PIN.</li>
            <li>Passwords and PINs are stored as one-way hashes. Repeated incorrect attempts to unlock the tablet temporarily lock that account, and signer PIN checks are rate-limited.</li>
            <li>In the Barbaari tablet app, a child’s and signer’s details are cleared from the screen automatically: the tablet returns to the child list a few seconds after an attendance action is saved, or after about 90 seconds without activity in the middle of a check-in or check-out.</li>
            <li>“Lock” ends the unlocked session on the tablet.</li>
            <li>Attendance is not saved while the tablet is offline, so records are never stored on the tablet to be sent later.</li>
            <li>Information is sent over encrypted connections (HTTPS), and every request is checked against the user’s role and daycare, so one daycare cannot see another daycare’s data.</li>
            <li>Signature images are kept in private storage and are only available to authorized users of the daycare.</li>
          </ul>
          <p>No system is perfectly secure. If we learn of a security incident that affects your information, we will notify the affected daycare and users as required by law.</p>
        </section>

        <section id="retention">
          <h2>7. Data retention</h2>
          <p>
            We keep information for as long as the daycare’s Barbaari account is active, or as long as needed to provide the service.
            Attendance, absence and signature records made on the tablet are kept as part of the daycare’s records. Daycares often
            have legal record-keeping duties for attendance, so a daycare may need to keep these records after a child leaves.
          </p>
          <p>
            When information is no longer needed, or when a daycare asks us to delete its data, we delete it or make it anonymous,
            unless we must keep it to meet legal, tax, accounting or security obligations or to resolve disputes.
          </p>
        </section>

        <section id="deletion">
          <h2>8. Account and data deletion</h2>
          <ul>
            <li><strong>Staff, teachers and managers</strong> who unlock the tablet have accounts managed by their daycare. Ask your daycare administrator to deactivate or remove your account, or contact us.</li>
            <li><strong>Parents, guardians and authorized pickup people</strong> are set up by the daycare as signers. To change or remove your signer details, or attendance records about your child, contact your daycare, or email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will help.</li>
            <li><strong>Daycares</strong> can ask us to close their Barbaari account and delete their organization’s data by contacting us from an administrator account.</li>
          </ul>
          <p>We may need to verify your identity before we act on a request, and we will tell you if a legal obligation requires us to keep some information.</p>
        </section>

        <section id="children">
          <h2>9. Children’s information</h2>
          <p>
            The Barbaari tablet is used by adults: daycare staff, and parents, guardians and authorized pickup people who sign for a
            child. Children do not use the tablet or have accounts. Information about children is entered by their daycare and is
            used only to record that child’s attendance for the daycare. If you believe information about a child was added without
            proper authorization, contact the daycare or <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will help.
          </p>
        </section>

        <section id="choices">
          <h2>10. Your choices and rights</h2>
          <p>
            Depending on where you live, you may have the right to access, correct, delete or receive a copy of your personal
            information, and to object to or restrict some processing. Because daycares control the children and attendance records
            they create, we may refer requests about those records to the daycare and help it respond.
          </p>
          <p>Location access on the tablet can be turned off at any time, as described in <a href="#location">Device location</a>.</p>
          <p>To make a request, contact us using the details below. We will not discriminate against you for exercising your rights.</p>
        </section>

        <section id="changes">
          <h2>11. Changes to this policy</h2>
          <p>
            We may update this policy when the tablet app changes. We will post the new version on this page and change the “Last
            updated” date. If a change is significant, we will also let daycare administrators know.
          </p>
        </section>

        <section id="contact">
          <h2>12. Contact us</h2>
          <p>For privacy questions or requests, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
          <p>If your question is about information your daycare recorded, you can also contact your daycare directly.</p>
        </section>
      </main>

      <footer className="bb-legal-footer">
        <span>© {new Date().getFullYear()} Barbaari</span>
        <Link to="/privacy-policy">Privacy Policy</Link>
        <Link to="/login">Sign in</Link>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </footer>
    </div>
  );
}
