import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — CSE Intelligence',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Render children directly — no Header, no nav chrome
  return <>{children}</>;
}
