import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';
import { DisplayModeProvider } from '@/contexts/display-mode-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { AuthProvider } from '@/contexts/auth-context';
import { ShariahModeProvider } from '@/contexts/shariah-mode-context';

// Geist — Vercel's typeface, shipped via Google Fonts. Distinctive,
// geometric, tuned for fintech density. Replaces Inter (too generic).
const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CSE Dashboard \u2014 Colombo Stock Exchange Intelligence',
  description: 'AI-powered trading dashboard for the Colombo Stock Exchange with Shariah compliance screening',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CSE AI',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A0E17',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <AuthProvider>
            <DisplayModeProvider>
              <ShariahModeProvider>
                <div className="min-h-screen bg-background">
                  <AppShell>
                    {children}
                  </AppShell>
                </div>
              </ShariahModeProvider>
            </DisplayModeProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
