import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM גמבורג",
  description: "מערכת ניהול תפעולי - משרד עו״ד חנה גמבורג",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
