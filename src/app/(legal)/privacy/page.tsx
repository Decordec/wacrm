import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy policy", robots: { index: true, follow: true } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains how Decordec, a handmade rug business based in Bhadohi, Uttar Pradesh, India, together
        with its related brands RMC Collections and Saze Home (&quot;we&quot;, &quot;us&quot;), handles personal
        information in our customer messaging system at decordec-crm.vercel.app (the &quot;CRM&quot;).
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Your name, WhatsApp phone number and profile name when you message one of our WhatsApp Business numbers.</li>
        <li>The messages, images and files you send us on WhatsApp, and our replies.</li>
        <li>Notes about your enquiry or order that our team adds, such as products of interest and follow-up dates.</li>
        <li>For our own staff: name, email address and sign-in details used to log in to the CRM.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To reply to your enquiries, quote prices, process orders and provide after-sales support.</li>
        <li>To keep a history of our conversation so any team member can help you.</li>
        <li>To send you WhatsApp updates or offers, only where you have agreed to receive them. You can reply STOP at any time.</li>
      </ul>
      <h2>Meta and WhatsApp</h2>
      <p>
        Messages are exchanged through the WhatsApp Business Platform provided by Meta Platforms, Inc. Meta processes
        message data under its own terms and privacy policy. Where you have previously chatted with us on the WhatsApp
        Business app, earlier chats and contact details may be copied into the CRM so that our team has the full history.
      </p>
      <h2>Sharing</h2>
      <p>
        We do not sell your personal information. We share it only with service providers that run the CRM for us
        (Meta for WhatsApp messaging, Supabase for data storage and Vercel for hosting), and where the law requires it.
      </p>
      <h2>Storage and security</h2>
      <p>
        Data is stored in an access-controlled database. Access tokens are encrypted, and only authorised team members can
        sign in. We keep conversation records for as long as needed to serve you and meet legal and accounting
        obligations, after which they are deleted.
      </p>
      <h2>Your choices</h2>
      <p>
        You can ask us for a copy of your information, ask us to correct it, or ask us to delete it. See our{" "}
        <a href="/data-deletion">data deletion instructions</a>.
      </p>
      <h2>Contact</h2>
      <p>
        Decordec, Bhadohi, Uttar Pradesh, India · <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
