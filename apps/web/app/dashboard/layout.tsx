import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Manage your lab credentials, initiation responses, and payment scenarios.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <ReactQueryProvider>{children}</ReactQueryProvider>;
}
