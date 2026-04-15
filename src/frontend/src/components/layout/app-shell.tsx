'use client';

import { usePathname } from 'next/navigation';
import { Header } from './header';

/**
 * Wraps page content with the app chrome (Header + main container).
 * Renders children directly (no chrome) on the login page.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main id="main-content" className="container max-w-[1400px] mx-auto px-4 py-6">
        {children}
      </main>
    </>
  );
}
