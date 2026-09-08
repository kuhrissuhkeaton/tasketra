import { LegalLayout } from "../../components/LegalLayout";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated="August 4, 2026">
      <p>
        These Terms of Service ("Terms") are a legal agreement between you and Tasketra ("Tasketra," "we," "us," or
        "our") governing your access to and use of Tasketra, our project management application available at
        tasketra.com and any related services (collectively, the "Service"). By creating an account or otherwise
        using the Service, you agree to these Terms. If you don't agree, don't use the Service.
      </p>

      <h2>1. Beta status</h2>
      <p>
        Tasketra is currently in public beta. Features may change, break, or be removed without notice, and we
        don't guarantee uptime, data durability, or that the Service will be free of bugs during this period. We
        recommend exporting or backing up anything you can't afford to lose. We'll do our best to communicate major
        changes through the in-app "What's new" page.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least 18 years old (or the age of legal majority where you live) and able to form a binding
        contract to use the Service. You're responsible for the accuracy of the information you provide when
        registering, for keeping your password confidential, and for all activity that happens under your account.
        Tell us right away at <a href="mailto:info@tasketra.com">info@tasketra.com</a> if you suspect unauthorized
        access.
      </p>

      <h2>3. Your project data</h2>
      <p>
        Everything you create in Tasketra -- tasks, budgets, RAID items, stakeholder records, decisions, meeting
        notes, and so on ("Your Content") -- belongs to you. You grant Tasketra a limited license to host, store,
        process, and display Your Content solely to operate and improve the Service. We don't claim ownership of
        Your Content and we don't sell it.
      </p>
      <p>
        You're responsible for having the rights to anything you put into Tasketra and for complying with any
        obligations you have to third parties (like clients or teammates) whose information you enter.
      </p>

      <h2>4. Public sharing features</h2>
      <p>
        Tasketra lets you generate a public, unguessable link to share an individual decision request for
        stakeholder input (the "Decision" feature). Anyone with that link can view the decision and, once it's been
        responded to, the responder's name and choice. Don't share a link you don't want to be public, and don't put
        anything in a shareable Decision that shouldn't be visible outside your team.
      </p>

      <h2>5. Outbound webhooks</h2>
      <p>
        If you turn on the Connections feature, Tasketra will send project activity to a URL you configure. You're
        responsible for the security and correctness of that endpoint -- we send the data in good faith once you've
        configured it, but we don't control what happens to it after it leaves our servers, and we're not
        responsible for how a third-party tool you connect handles it.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        You agree to use the Service in accordance with our{" "}
        <a href="/legal/acceptable-use">Acceptable Use Policy</a>. We may suspend or terminate accounts that violate
        it.
      </p>

      {/* LAWYER REVIEW: this section describes a real, live auto-renewing subscription with a
          card-required free trial. Please confirm the disclosure here satisfies applicable
          auto-renewal / negative-option laws (e.g., California's Automatic Renewal Law, ROSCA,
          and any other state-specific requirements) for where Tasketra has customers, and that
          the refund/cancellation language is one we're comfortable standing behind. */}
      <h2>7. Fees and billing</h2>
      <p>
        Tasketra offers a Free plan (up to 3 projects, 2GB of storage) at no cost, forever. The Pro plan unlocks
        unlimited projects and 25GB of storage for $29/month or $290/year, and starts with a 14-day free trial.
      </p>
      <p>
        <strong>A payment method is required to start a Pro trial.</strong> If you don't cancel before the trial
        ends, we'll automatically charge the payment method on file for the plan and interval you selected, and
        your subscription will continue to renew automatically at that price at the end of each billing period
        until you cancel. We'll never charge you during the trial itself.
      </p>
      <p>
        The first 100 accounts to register get every Pro feature free, permanently, as a founding member -- no
        trial, no card required, and no future charge.
      </p>
      <p>
        You can cancel anytime from the Billing page in the app, which opens a secure, Stripe-hosted billing
        portal -- no need to contact us. Cancellation takes effect at the end of your current billing period, and
        you keep Pro access until then; we don't provide refunds for the unused portion of a period except where
        required by law. All payments are processed by Stripe; Tasketra never receives or stores your full card
        number.
      </p>
      <p>
        We may change our prices or plans in the future. If we do, we'll give existing subscribers advance notice
        before any change takes effect on their account.
      </p>

      <h2>8. Termination</h2>
      <p>
        You can stop using the Service and delete your account at any time from the Team tab. We may suspend or
        terminate your access if you violate these Terms or the Acceptable Use Policy, or if we discontinue the
        Service. On deletion, your projects are moved to a recoverable Trash for a limited period before being
        permanently removed; see our <a href="/legal/privacy">Privacy Policy</a> for details on data retention and
        deletion.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided "as is" and "as available," without warranties of any kind, express or implied,
        including merchantability, fitness for a particular purpose, and non-infringement -- especially given the
        Service's current beta status. We don't warrant that the Service will be uninterrupted, secure, or
        error-free.
      </p>

      {/* LAWYER REVIEW: previously this cap was described only in a "$0 during the free beta"
          framing, written before paid plans existed. Now that Pro subscribers pay real money,
          please confirm a liability cap tied purely to trailing-12-months fees paid (which is
          still $0 for Free-plan users) is the cap you want, or whether we should set a minimum
          floor (e.g., a flat dollar amount) regardless of plan. */}
      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Tasketra won't be liable for any indirect, incidental, special,
        consequential, or punitive damages, or for any loss of data, profits, or business, arising from your use of
        the Service. Our total liability for any claim arising from these Terms or the Service is limited to the
        amount you paid us in the twelve months before the claim arose (which is $0 if you're on the Free plan).
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of South Carolina, USA, without regard to its
        conflict-of-laws rules. Any dispute not resolved informally will be brought exclusively in the state or
        federal courts located in South Carolina, and you consent to that jurisdiction.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material changes, we'll post a notice in the app
        (e.g., on the What's New page) or email you at the address on your account. Continuing to use the Service
        after a change takes effect means you accept the updated Terms.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:info@tasketra.com">info@tasketra.com</a>
      </p>
    </LegalLayout>
  );
}
