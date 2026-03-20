import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/header';
import { DisplayModeProvider } from '@/contexts/display-mode-context';
import { ThemeProvider } from '@/contexts/theme-context';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
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
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0A0E17',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <DisplayModeProvider>
            <div className="min-h-screen bg-background">
              <Header />
              <main className="container max-w-[1400px] mx-auto px-4 py-6">
                {children}
              </main>
            </div>
          </DisplayModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
