import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitzy Code Chat",
  description: "RAG chat over fitzyracing1 GitHub repositories",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
