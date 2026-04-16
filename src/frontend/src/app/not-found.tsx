import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-card border border-border rounded-xl p-8 max-w-md w-full text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <FileQuestion className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          Page not found
        </h2>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
