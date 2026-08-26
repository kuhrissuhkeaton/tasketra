import { LegalLayout } from "../../components/LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="August 5, 2026">
      <p>
        This Privacy Policy explains what information Tasketra ("we," "us," "our") collects, how we use it, and
        the choices you have. It applies to tasketra.com and the Tasketra application (the "Service").
      </p>

      <h2>1. Information we collect</h2>
      <p>
        <strong>Account information:</strong> your email address and a password. We never store your password in
        plain text -- it's hashed with bcrypt before it touches our database, and even we can't read it back out.
      </p>
      <p>
        <strong>Content you create:</strong> anything you enter into a project -- tasks, budget figures, RAID log
        entries, stakeholder records, decisions, meeting notes and action items, change requests, and similar
        project data -- plus any files you upload as project documentation (PDFs, Word/Excel files, and images,
        up to 5MB each). Uploaded files are stored via Netlify, the same as the rest of your project data, and are
        only accessible to people with access to that project.
      </p>
      <p>
        <strong>Technical information:</strong> standard web server logs collected by our hosting provider
        (Netlify), such as IP address, browser type, and request timestamps, used for security and reliability --
        not for tracking or advertising.
      </p>
      <p>
        <strong>A session cookie:</strong> see our <a href="/legal/cookies">Cookie Policy</a> for detail. It's the
        only cookie the Service currently sets.
      </p>
      <p>
        <strong>Site analytics:</strong> we use Plausible Analytics, a privacy-focused analytics tool that doesn't
        use cookies, doesn't assign you a persistent identifier, and only reports aggregate numbers (like total
        visits to a page) -- it can't be used to identify or track an individual visitor. See our{" "}
        <a href="/legal/cookies">Cookie Policy</a> for detail. We do not use any advertising or cross-site tracking
        scripts on tasketra.com.
      </p>

      <h2>2. How we use your information</h2>
      <ul>
        <li>
          To provide the Service: authenticate you, save and display your project data, and enable features like
          meetings, change requests, and reporting.
        </li>
        <li>To communicate with you: password-reset emails, and replies if you contact us for feedback or support.</li>
        <li>To keep the Service secure and working: diagnosing bugs, preventing abuse, and maintaining uptime.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use your project content to train any AI/ML models.</p>

      <h2>3. Who we share information with</h2>
      <p>
        We share information only with the service providers ("subprocessors") that help us run Tasketra, and only
        to the extent needed to provide the Service:
      </p>
      <ul>
        <li>
          <strong>Netlify</strong> -- hosting, serverless functions, and our managed Postgres database. Netlify
          stores and processes essentially all Service data on our behalf.
        </li>
        <li>
          <strong>Resend</strong> -- sends transactional emails (currently just password-reset links) on our
          behalf. We only send Resend the recipient address and the email content itself.
        </li>
        <li>
          <strong>Plausible Analytics</strong> -- provides aggregate website traffic analytics. Because Plausible is
          cookieless and doesn't use persistent identifiers, it doesn't receive or store personal information about
          you as an individual.
        </li>
      </ul>
      <p>
        We don't share your data with advertisers, data brokers, or anyone else, and we won't disclose it to third
        parties except: with your direction (e.g., a public Decision link you choose to share), to comply with the
        law or a valid legal process, or to protect the rights, safety, or property of Tasketra, our users, or the
        public.
      </p>

      <h2>4. Public sharing features</h2>
      <p>
        If you create a shareable Decision link, the decision's title, context, options, and (once answered) the
        responder's name and chosen option are visible to anyone who has that link, without needing an account.
        This is intentional -- it's how the feature works -- but it means that information is not private once
        shared. Don't use this feature for anything you don't want visible outside your team.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We keep your account and project information for as long as your account is active. When you delete an
        item, it moves to a recoverable Trash for a limited period so you can undo mistakes, then it's permanently
        removed. When you delete your account, we deactivate it and schedule your personal data for permanent
        deletion within 30 days; some information may be retained longer where we're required to by law or for
        legitimate business records (e.g., fraud prevention).
      </p>

      <h2>6. Security</h2>
      <p>
        We use industry-standard practices to protect your information, including password hashing (bcrypt),
        encrypted connections (HTTPS) for all traffic, and HttpOnly/Secure/SameSite session cookies that can't be
        read by page scripts. No system is perfectly secure, and we can't guarantee absolute security, but we take
        reasonable steps to protect your data and will notify affected users if we become aware of a breach
        affecting their personal information, as required by law.
      </p>

      <h2>7. Your rights and choices</h2>
      <p>
        You can access, correct, export, or delete most of your data directly in the app (project export, item-level
        Trash/restore, and account deletion from the Team tab). You can also contact us at{" "}
        <a href="mailto:info@tasketra.com">info@tasketra.com</a> to request a copy of your data, ask us to correct
        or delete it, or ask questions about how it's used. If you're located in the EEA, UK, or another
        jurisdiction with its own data protection law (like California's CCPA/CPRA), you may have additional
        statutory rights -- contact us and we'll do our best to accommodate them; for EU/UK requests we act as the
        data controller for your account information.
      </p>

      <h2>8. Children's privacy</h2>
      <p>
        Tasketra isn't directed at children, and we don't knowingly collect personal information from anyone under
        18. If you believe a child has provided us with personal information, contact us and we'll delete it.
      </p>

      <h2>9. International data transfers</h2>
      <p>
        Our infrastructure (Netlify) may process and store data in the United States and other countries where
        Netlify or its subprocessors operate. By using the Service, you understand your information may be
        transferred to and processed in countries other than your own.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We'll post the new version here with an updated "Last
        updated" date, and for material changes we'll provide additional notice (e.g., in-app or by email).
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this policy or your data: <a href="mailto:info@tasketra.com">info@tasketra.com</a>
      </p>
    </LegalLayout>
  );
}
