'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getChannelPosts, type ChannelPost } from '../../../../lib/adminClient';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChannelPosts()
      .then((data) => setPosts(data.posts))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load posts'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="admin-header">
        <h1>Channel posts</h1>
        <div className="admin-actions">
          <Link href="/admin/posts/new?type=challenge" className="admin-btn admin-btn-primary">
            New challenge
          </Link>
          <Link href="/admin/posts/new?type=news" className="admin-btn admin-btn-secondary">
            New news
          </Link>
        </div>
      </div>

      <p style={{ color: 'var(--admin-muted)', marginTop: 0 }}>
        Compose challenges and news, then publish them to your Telegram channel.
      </p>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p>Loading…</p> : null}

      {!loading && posts.length === 0 ? (
        <div className="admin-card">No posts yet. Create your first challenge or news item.</div>
      ) : null}

      {!loading && posts.length > 0 ? (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Image</th>
                <th>Status</th>
                <th>Telegram</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>{post.title}</td>
                  <td>
                    <span className={`admin-badge admin-badge-${post.type}`}>{post.type}</span>
                  </td>
                  <td>{post.imagePreviewUrl ? 'Yes' : '—'}</td>
                  <td>
                    <span className={`admin-badge admin-badge-${post.status}`}>{post.status}</span>
                  </td>
                  <td>{post.telegramPostedAt ? 'Posted' : '—'}</td>
                  <td>{formatDate(post.updatedAt)}</td>
                  <td>
                    <Link href={`/admin/posts/${post.id}`} className="admin-btn admin-btn-secondary">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
