import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EstateFlow — Real Estate CRM", template: "%s · EstateFlow" },
  description: "Leads, listings, viewings, deals and commissions for UAE brokerages.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
