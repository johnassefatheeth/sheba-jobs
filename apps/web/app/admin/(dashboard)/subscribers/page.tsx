'use client';

import { useEffect, useState } from 'react';
import { getSubscribers, type TelegramSubscriber } from '../../../../lib/adminClient';

export default function AdminSubscribersPage() {
  const [subscribers, setSubscribers] = useState<TelegramSubscriber[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubscribers()
      .then((data) => setSubscribers(data.subscribers))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load subscribers'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="admin-header">
        <h1>Telegram subscribers</h1>
        <span style={{ color: 'var(--admin-muted)' }}>{subscribers.length} shown</span>
      </div>

      <p style={{ color: 'var(--admin-muted)', marginTop: 0 }}>
        Users who opted in to job alerts via the Telegram bot.
      </p>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p>Loading…</p> : null}

      {!loading && subscribers.length === 0 ? (
        <div className="admin-card">No subscribers yet.</div>
      ) : null}

      {!loading && subscribers.length > 0 ? (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Status</th>
                <th>Filters</th>
                <th>Deliveries</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((subscriber) => (
                <tr key={subscriber.id}>
                  <td>{subscriber.firstName || '—'}</td>
                  <td>{subscriber.username ? `@${subscriber.username}` : '—'}</td>
                  <td>{subscriber.isActive ? 'Active' : 'Paused'}</td>
                  <td>
                    {subscriber.receiveAll
                      ? 'All jobs'
                      : subscriber.categories.length > 0
                        ? subscriber.categories.join(', ')
                        : 'Custom filters'}
                  </td>
                  <td>{subscriber._count.deliveries}</td>
                  <td>{new Date(subscriber.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
