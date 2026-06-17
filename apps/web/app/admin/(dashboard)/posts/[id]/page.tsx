'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  getChannelPost,
  publishChannelPostToTelegram,
  removeChannelPost,
  removeChannelPostImage,
  updateChannelPost,
  uploadChannelPostImage,
  type ChannelPost,
  type PendingChannelPostImage,
} from '../../../../../lib/adminClient';
import PostImageField from '../PostImageField';

export default function EditPostPage() {
  const params = useParams<{ id: string }>();
  const [post, setPost] = useState<ChannelPost | null>(null);
  const [type, setType] = useState<'challenge' | 'news'>('challenge');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingChannelPostImage | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getChannelPost(params.id)
      .then((data) => {
        setPost(data);
        setType(data.type);
        setTitle(data.title);
        setBody(data.body);
        setButtonText(data.buttonText || '');
        setButtonUrl(data.buttonUrl || '');
        setImageUrl(data.imageUrl || '');
        setImagePreviewUrl(data.imagePreviewUrl || null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load post'))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      let updated = await updateChannelPost(params.id, {
        type,
        title,
        body,
        buttonText,
        buttonUrl,
        imageUrl: pendingImage ? '' : imageUrl,
      });

      if (pendingImage) {
        updated = await uploadChannelPostImage(params.id, pendingImage);
        setPendingImage(null);
      }

      setPost(updated);
      setImagePreviewUrl(updated.imagePreviewUrl || null);
      setSuccess('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveImage() {
    setSaving(true);
    setError('');
    try {
      const updated = await removeChannelPostImage(params.id);
      setPost(updated);
      setImagePreviewUrl(null);
      setImageUrl('');
      setPendingImage(null);
      setSuccess('Image removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove image');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (pendingImage) {
        await uploadChannelPostImage(params.id, pendingImage);
        setPendingImage(null);
      }
      const updated = await publishChannelPostToTelegram(params.id);
      setPost(updated);
      setImagePreviewUrl(updated.imagePreviewUrl || null);
      setSuccess('Published to Telegram.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this post?')) return;
    setSaving(true);
    setError('');

    try {
      await removeChannelPost(params.id);
      window.location.href = '/admin/posts';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (!post) return <p className="admin-error">{error || 'Post not found'}</p>;

  const published = post.status === 'published' && Boolean(post.telegramPostedAt);

  return (
    <>
      <div className="admin-header">
        <h1>Edit post</h1>
        <Link href="/admin/posts" className="admin-btn admin-btn-secondary">
          Back
        </Link>
      </div>

      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <span className={`admin-badge admin-badge-${post.type}`}>{post.type}</span>{' '}
        <span className={`admin-badge admin-badge-${post.status}`}>{post.status}</span>
        {published && post.telegramPostedAt ? (
          <span style={{ marginLeft: '0.5rem', color: 'var(--admin-muted)', fontSize: '0.9rem' }}>
            Posted {new Date(post.telegramPostedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      <form
        className="admin-form admin-card"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <div className="admin-field">
          <label htmlFor="type">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value as 'challenge' | 'news')}>
            <option value="challenge">Challenge</option>
            <option value="news">News</option>
          </select>
        </div>

        <div className="admin-field">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className="admin-field">
          <label htmlFor="body">Message</label>
          <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} required />
        </div>

        <PostImageField
          previewUrl={imagePreviewUrl}
          imageUrl={imageUrl}
          onImageUrlChange={setImageUrl}
          onPendingImageChange={setPendingImage}
          onRemoveExisting={() => void handleRemoveImage()}
          disabled={saving}
        />

        <div className="admin-field">
          <label htmlFor="buttonText">Button text (optional)</label>
          <input id="buttonText" value={buttonText} onChange={(e) => setButtonText(e.target.value)} />
        </div>

        <div className="admin-field">
          <label htmlFor="buttonUrl">Button URL (optional)</label>
          <input id="buttonUrl" value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} />
        </div>

        {error ? <p className="admin-error">{error}</p> : null}
        {success ? <p className="admin-success">{success}</p> : null}

        <div className="admin-actions">
          <button type="submit" className="admin-btn admin-btn-secondary" disabled={saving}>
            Save changes
          </button>
          {!published ? (
            <button type="button" className="admin-btn admin-btn-primary" disabled={saving} onClick={() => void handlePublish()}>
              Publish to Telegram
            </button>
          ) : null}
          <button type="button" className="admin-btn admin-btn-danger" disabled={saving} onClick={() => void handleDelete()}>
            Delete
          </button>
        </div>
      </form>
    </>
  );
}
