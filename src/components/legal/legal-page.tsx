import type { ReactNode } from "react";

export const LEGAL_CONTACT_EMAIL = "decordec2020@gmail.com";
export const LEGAL_UPDATED = "27 November 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-6 py-12 space-y-5 text-[15px] leading-7 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_a]:underline">
        <header className="space-y-1 border-b border-border pb-4">
          <p className="text-sm text-muted-foreground">Decordec · RMC Collections · Saze Home</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LEGAL_UPDATED}</p>
        </header>
        {children}
        <footer className="border-t border-border pt-4 text-sm text-muted-foreground">
          <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of service</a> ·{" "}
          <a href="/data-deletion">Data deletion</a>
        </footer>
      </article>
    </main>
  );
}
