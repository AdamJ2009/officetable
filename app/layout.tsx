import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Office Games Tracker",
  description: "Track office game results and rankings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Office Games
            </Link>
            <div className="flex gap-6">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Leaderboard
              </Link>
              <Link href="/players" className="text-gray-600 hover:text-gray-900">
                Players
              </Link>
              <Link href="/matches/new" className="text-gray-600 hover:text-gray-900">
                Record Match
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1 bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}