import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SweepScout AI",
  description: "Personal sweepstakes discovery, compliance, and assisted-entry tracker.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
