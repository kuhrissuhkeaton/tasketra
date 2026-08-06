import { LegalLayout } from "../../components/LegalLayout";

export default function AcceptableUse() {
  return (
    <LegalLayout title="Acceptable Use Policy" updated="August 4, 2026">
      <p>
        This Acceptable Use Policy applies to everyone who uses Tasketra. It's meant to be short and apply common
        sense; violating it can result in suspension or termination of your account, as described in our{" "}
        <a href="/legal/terms">Terms of Service</a>.
      </p>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for anything illegal, fraudulent, or that violates the rights of others.</li>
        <li>
          Access another user's account or project data without authorization, or attempt to circumvent
          authentication or access controls.
        </li>
        <li>
          Probe, scan, or test the vulnerability of the Service, or attempt to interfere with its normal operation
          (e.g., excessive automated requests, denial-of-service attempts).
        </li>
        <li>
          Upload or transmit malware, or any content designed to disrupt, damage, or gain unauthorized access to
          systems or data.
        </li>
        <li>
          Reverse-engineer, decompile, or attempt to extract the source code of the Service, except where the law
          explicitly allows it.
        </li>
        <li>
          Use the public Decision-link feature or the outbound-webhook feature to send spam, phishing content, or
          anything illegal or abusive to a third party.
        </li>
        <li>Impersonate another person or misrepresent your affiliation with any person or entity.</li>
        <li>Resell, sublicense, or provide access to the Service to third parties outside your own team without our permission.</li>
        <li>
          Use the Service to store or transmit content that is unlawful, defamatory, obscene, or infringes someone
          else's intellectual property rights.
        </li>
      </ul>

      <h2>Reporting a violation</h2>
      <p>
        If you become aware of misuse of the Service, let us know at{" "}
        <a href="mailto:info@tasketra.com">info@tasketra.com</a>. We review reports and take action at our
        discretion, up to and including account suspension or termination, consistent with our{" "}
        <a href="/legal/terms">Terms of Service</a>.
      </p>
    </LegalLayout>
  );
}
