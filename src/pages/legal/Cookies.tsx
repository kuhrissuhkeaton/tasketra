import { LegalLayout } from "../../components/LegalLayout";

export default function Cookies() {
  return (
    <LegalLayout title="Cookie Policy" updated="August 5, 2026">
      <p>Tasketra uses exactly one cookie, plus one cookie-free analytics tool.</p>

      <h2>tasketra_session</h2>
      <ul>
        <li>Purpose: keeps you logged in between visits.</li>
        <li>Type: strictly necessary / essential -- the Service can't authenticate you without it.</li>
        <li>
          Contents: a signed token tied to your account ID and an expiration time. It doesn't contain your email,
          password, or project data.
        </li>
        <li>Set by: tasketra.com (first-party -- no third party ever sees this cookie).</li>
        <li>Attributes: HttpOnly (can't be read by page JavaScript), Secure (only sent over HTTPS), SameSite=Lax.</li>
        <li>Duration: 30 days, or until you log out (which clears it immediately).</li>
      </ul>

      <h2>Site analytics (Plausible)</h2>
      <p>
        We use <a href="https://plausible.io" target="_blank" rel="noreferrer">Plausible Analytics</a> to understand
        overall traffic and usage patterns -- things like which pages get visited and roughly how many people use
        Tasketra. Plausible is built specifically to avoid cookies and cross-site tracking:
      </p>
      <ul>
        <li>It sets no cookies and stores no persistent identifier in your browser.</li>
        <li>It doesn't track you across other websites or build an advertising profile.</li>
        <li>It only records aggregate, anonymized numbers (like a daily visitor count) -- it can't be used to look up an individual person's activity.</li>
        <li>We never sell or share this data with anyone.</li>
      </ul>
      <p>
        Because it doesn't use cookies or any other persistent tracking technology, Plausible falls outside the
        cookie-consent requirements of laws like the EU/UK ePrivacy rules, and outside the "sale or sharing of
        personal information" that triggers opt-out rights under US state privacy laws (like California's CPRA) --
        so no consent banner is required for it. If we ever add a tool that works differently -- for example,
        something that does use cookies or persistent identifiers -- we'll update this policy and add a
        cookie-consent banner where required by law before doing so.
      </p>

      <h2>What we don't use</h2>
      <p>
        Tasketra does not set any advertising cookies or third-party tracking cookies of any kind, and does not use
        any analytics tool that relies on cookies or cross-site identifiers.
      </p>
      <p>
        Because our only cookie is strictly necessary for the Service to function, most privacy laws (including the
        EU/UK ePrivacy rules) don't require us to ask for your consent to set it -- it's the same category as a
        cookie that keeps items in your shopping cart. You can still block or delete it through your browser
        settings, but doing so will log you out and you'll need to log back in each visit.
      </p>

      <h2>Questions</h2>
      <p>
        <a href="mailto:info@tasketra.com">info@tasketra.com</a>
      </p>
    </LegalLayout>
  );
}
