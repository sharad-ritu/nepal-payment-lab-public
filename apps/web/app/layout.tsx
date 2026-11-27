import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Instrument_Sans,
  JetBrains_Mono,
} from "next/font/google";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const bodyFont = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-body",
});
const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-display",
});
const codeFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
});

export const metadata: Metadata = {
  applicationName: "Nepal Payment Lab",
  title: {
    default: "Nepal Payment Lab | Test your payment flows",
    template: "%s | Nepal Payment Lab",
  },
  description:
    "Test Khalti, eSewa, connectIPS, and NPX payment integrations with controlled checkout outcomes. No real money moves.",
  category: "Developer tools",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${codeFont.variable}`}
    >
      <body className="flex min-h-svh flex-col" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
