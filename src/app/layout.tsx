import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JFR Ranch — Position Desk",
  description: "Unit economics, lot scorecard, and market position for JFR Ranch Co. Ltd.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
