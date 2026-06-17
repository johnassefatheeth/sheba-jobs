'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminStats, type AdminStats } from '../../../lib/adminClient';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'));
  }, []);

  return (
    <>
      <div className="admin-header">
        <h1>Dashboard</h1>
        <Link href="/admin/posts/new" className="admin-btn admin-btn-primary">
          New channel post
        </Link>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      {!stats ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="admin-grid" style={{ marginBottom: '1rem' }}>
            <div className="admin-card">
              <div className="admin-stat-value">{stats.jobs.active}</div>
              <div className="admin-stat-label">Active jobs</div>
            </div>
            <div className="admin-card">
              <div className="admin-stat-value">{stats.jobs.postedToday}</div>
              <div className="admin-stat-label">Posted today</div>
            </div>
            <div className="admin-card">
              <div className="admin-stat-value">{stats.jobs.telegramPosted}</div>
              <div className="admin-stat-label">Jobs on Telegram</div>
            </div>
            <div className="admin-card">
              <div className="admin-stat-value">{stats.subscribers.active}</div>
              <div className="admin-stat-label">Active subscribers</div>
            </div>
            <div className="admin-card">
              <div className="admin-stat-value">{stats.channelPosts.drafts}</div>
              <div className="admin-stat-label">Draft posts</div>
            </div>
            <div className="admin-card">
              <div className="admin-stat-value">{stats.channelPosts.published}</div>
              <div className="admin-stat-label">Published posts</div>
            </div>
          </div>

          <div className="admin-card">
            <h2 style={{ marginTop: 0 }}>Quick actions</h2>
            <div className="admin-actions">
              <Link href="/admin/posts/new?type=challenge" className="admin-btn admin-btn-primary">
                Send challenge
              </Link>
              <Link href="/admin/posts/new?type=news" className="admin-btn admin-btn-secondary">
                Send news
              </Link>
              <Link href="/admin/jobs" className="admin-btn admin-btn-secondary">
                Manage jobs
              </Link>
              <Link href="/admin/subscribers" className="admin-btn admin-btn-secondary">
                View subscribers
              </Link>
            </div>
            {!stats.telegram.configured ? (
              <p className="admin-error" style={{ marginTop: '1rem' }}>
                Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_CHANNEL_ID to publish posts.
              </p>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
