'use client';

import type { ReactNode } from 'react';

// The central Alces Bookie — "a book of accounts" — hosts every individual
// bank account (the same service behind the /api/v1 transfers this site
// mirrors). Every account view on the site links here so the real balances
// are always one click away.

export const ALCES_BOOKIE_URL = 'http://10.151.0.85:3001';

/** Small external link to the central bank's account book. */
export function BookieBankLink({
  children,
  className = '',
  title = 'Open the central bank — every individual account lives there',
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <a
      href={ALCES_BOOKIE_URL}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={`underline decoration-dotted hover:decoration-solid ${className}`}
    >
      {children ?? '🏦 book of accounts ↗'}
    </a>
  );
}