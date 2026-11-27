import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of service", robots: { index: true, follow: true } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms apply to the customer messaging system at decordec-crm.vercel.app, operated by Decordec, Bhadohi,
        Uttar Pradesh, India, for itself and its related brands RMC Collections and Saze Home.
      </p>
      <h2>Who can use it</h2>
      <p>
        The CRM is an internal tool. Only staff and partners we authorise may sign in. Customers do not use the CRM
        directly; they simply message our WhatsApp Business numbers.
      </p>
      <h2>Messaging</h2>
      <p>
        When you message us on WhatsApp, you agree that we may reply and keep a record of the conversation as described in
        our <a href="/privacy">privacy policy</a>. We send promotional messages only to people who have agreed to receive
        them, and you can opt out at any time by replying STOP. Use of WhatsApp is also subject to WhatsApp&apos;s own terms.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Authorised users must keep their sign-in details private, use customer information only to serve those customers,
        and follow WhatsApp Business policies.
      </p>
      <h2>Liability</h2>
      <p>
        The CRM is provided as is. Product prices, availability and order terms are confirmed separately in each quotation
        or invoice.
      </p>
      <h2>Contact</h2>
      <p>
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
