import type { Metadata } from "next";
import { Domine, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const heading = Domine({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexus",
  description: "An AI-native personal knowledge and productivity workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full flex flex-col">{children}</body>
    </html>
  );
}
