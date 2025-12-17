import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Curriculum Dashboard | Drones, AR/VR, 3D Printing",
  description:
    "Commercialize drone, AR/VR, and 3D printing curriculum with Supabase-powered dashboards for schools and educators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="green">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-surface text-slate-900 dynamic-bg`}
      >
        {children}
      </body>
    </html>
  );
}
