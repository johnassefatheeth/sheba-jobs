'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { removeAdminJob as deleteAdminJob, getAdminJobs, patchAdminJob, type AdminJob } from '../../../../lib/adminClient';

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminJobs({ search, includeExpired });
      setJobs(data.jobs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [includeExpired]);

  async function toggleExpired(job: AdminJob) {
    setBusyId(job.id);
    try {
      await patchAdminJob(job.id, { isExpired: !job.isExpired });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(job: AdminJob) {
    if (!confirm(`Delete "${job.title}"?`)) return;
    setBusyId(job.id);
    try {
      await deleteAdminJob(job.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="admin-header">
        <h1>Jobs</h1>
        <span style={{ color: 'var(--admin-muted)' }}>{total} total</span>
      </div>

      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Search title or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load();
          }}
        />
        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => void load()}>
          Search
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={(e) => setIncludeExpired(e.target.checked)}
          />
          Include expired
        </label>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p>Loading…</p> : null}

      {!loading ? (
        <div className="admin-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Source</th>
                <th>Status</th>
                <th>Telegram</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    {job.slug ? (
                      <Link href={`/jobs/${job.slug}`} target="_blank">
                        {job.title}
                      </Link>
                    ) : (
                      job.title
                    )}
                  </td>
                  <td>{job.company || '—'}</td>
                  <td>{job.scrapedFrom || '—'}</td>
                  <td>{job.isExpired ? 'Expired' : 'Active'}</td>
                  <td>{job.telegramPostedAt ? 'Posted' : '—'}</td>
                  <td>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        disabled={busyId === job.id}
                        onClick={() => void toggleExpired(job)}
                      >
                        {job.isExpired ? 'Restore' : 'Expire'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger"
                        disabled={busyId === job.id}
                        onClick={() => void handleDelete(job)}
                      >
                        Delete
                      </button>
                    </div>
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
