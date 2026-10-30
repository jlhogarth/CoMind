import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./cux-002.css";

export const metadata: Metadata = {
  title: {
    default: "CoMind Control Plane",
    template: "%s | CoMind",
  },
  description: "Governed CoMind infrastructure, monitoring, operations, and evidence console",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
