'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logoutAdmin } from '../../../lib/adminClient';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/posts', label: 'Channel posts' },
  { href: '/admin/jobs', label: 'Jobs' },
  { href: '/admin/subscribers', label: 'Subscribers' },
];

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logoutAdmin();
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className="admin-root">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            Sheba Admin
            <span>Site management</span>
          </div>
          <nav className="admin-nav">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'active' : ''}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div style={{ marginTop: 'auto' }}>
            <Link href="/" className="admin-btn admin-btn-secondary" style={{ width: '100%', marginBottom: '0.5rem' }}>
              View site
            </Link>
            <button type="button" className="admin-btn admin-btn-secondary" style={{ width: '100%' }} onClick={handleLogout}>
              Log out
            </button>
          </div>
        </aside>
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}
