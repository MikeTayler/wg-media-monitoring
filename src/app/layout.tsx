import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wise Group Media Monitor",
  description:
    "NZ media monitoring for the Wise Group — RSS ingestion and daily digest (PoC).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-NZ">
      <body>{children}</body>
    </html>
  );
}
