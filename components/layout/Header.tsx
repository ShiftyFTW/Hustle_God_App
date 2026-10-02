'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Menu } from 'lucide-react';
import { useState } from 'react';
import Sidebar from './Sidebar';

function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; href?: string }[] = [{ label: 'Dashboard', href: '/dashboard' }];
  if (segments[0] === 'items') {
    if (segments[1] === 'new') {
      crumbs.push({ label: 'New Item', href: '/items/new' });
      if (segments[2] === 'details') {
        crumbs.push({ label: 'Manual Entry' });
      }
    } else if (segments[1]) {
      crumbs.push({ label: `Item ${segments[1].slice(0, 8)}...`, href: `/items/${segments[1]}` });
      if (segments[2]) {
        crumbs.push({ label: segments[2].charAt(0).toUpperCase() + segments[2].slice(1) });
      }
    }
  } else if (segments[0] === 'import') {
    crumbs.push({ label: 'Import from Drive' });
  } else if (segments[0] === 'settings') {
    crumbs.push({ label: 'Settings' });
  }
  return crumbs;
}

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const crumbs = getBreadcrumbs(pathname);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 md:px-6 h-14 border-b border-border bg-background/80 backdrop-blur-sm">
        <button
          className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1 whitespace-nowrap">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50">
            <Sidebar />
          </div>
        </div>
      )}
    </>
  );
}
