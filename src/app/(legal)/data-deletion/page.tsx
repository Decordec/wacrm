import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Data deletion", robots: { index: true, follow: true } };

export default function DataDeletionPage() {
  return (
    <LegalPage title="How to delete your data">
      <p>
        You can ask Decordec, RMC Collections or Saze Home to delete the personal information we hold about you in our
        customer messaging system, including your contact details and WhatsApp conversation history.
      </p>
      <h2>How to ask</h2>
      <ul>
        <li>
          Send a WhatsApp message saying <strong>&quot;Delete my data&quot;</strong> to the business number you chatted
          with, or
        </li>
        <li>
          Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> with the subject &quot;Data
          deletion&quot; and the phone number you used.
        </li>
      </ul>
      <h2>What happens next</h2>
      <p>
        We confirm the request comes from the owner of that phone number, then delete your contact record, conversations,
        notes and deals from the CRM within 30 days and confirm by reply. We may keep a limited record of past orders
        where tax or accounting law requires it.
      </p>
      <p>
        Messages also stored by WhatsApp on your phone or by Meta are controlled by WhatsApp. You can delete those in the
        WhatsApp app.
      </p>
    </LegalPage>
  );
}
