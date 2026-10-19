import React from 'react';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { VideoProvider } from '@/lib/VideoContext';
import { AuthProvider } from '@/lib/AuthContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrafficAI - Hệ Thống Giám Sát Giao Thông Thông Minh',
  description:
    'Hệ thống giám sát camera AI, tự động nhận diện phương tiện, biển số xe và phát hiện vi phạm giao thông theo thời gian thực.',
  keywords: 'giao thông thông minh, AI, giám sát camera, nhận diện biển số, ALPR, TrafficAI',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/favicon.png',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AuthProvider>
          <VideoProvider>{children}</VideoProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
