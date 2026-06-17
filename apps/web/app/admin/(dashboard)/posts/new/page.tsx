'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  createChannelPost,
  publishChannelPostToTelegram,
  uploadChannelPostImage,
  type PendingChannelPostImage,
} from '../../../../../lib/adminClient';
import PostImageField from '../PostImageField';

function NewPostForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') === 'news' ? 'news' : 'challenge';

  const [type, setType] = useState<'challenge' | 'news'>(initialType);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingChannelPostImage | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSave(publish: boolean) {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const post = await createChannelPost({
        type,
        title,
        body,
        buttonText: buttonText || undefined,
        buttonUrl: buttonUrl || undefined,
        imageUrl: !pendingImage && imageUrl ? imageUrl : undefined,
      });

      if (pendingImage) {
        await uploadChannelPostImage(post.id, pendingImage);
      }

      if (publish) {
        await publishChannelPostToTelegram(post.id);
        setSuccess('Published to Telegram.');
      } else {
        setSuccess('Draft saved.');
      }

      router.push(`/admin/posts/${post.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="admin-header">
        <h1>New channel post</h1>
      </div>

      <form
        className="admin-form admin-card"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave(false);
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
          <small>Plain text is fine. Line breaks are preserved in Telegram.</small>
        </div>

        <PostImageField
          imageUrl={imageUrl}
          onImageUrlChange={setImageUrl}
          onPendingImageChange={setPendingImage}
          disabled={loading}
        />

        <div className="admin-field">
          <label htmlFor="buttonText">Button text (optional)</label>
          <input
            id="buttonText"
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            placeholder="Learn more"
          />
        </div>

        <div className="admin-field">
          <label htmlFor="buttonUrl">Button URL (optional)</label>
          <input
            id="buttonUrl"
            value={buttonUrl}
            onChange={(e) => setButtonUrl(e.target.value)}
            placeholder="https://sheba.jobs/..."
          />
        </div>

        {error ? <p className="admin-error">{error}</p> : null}
        {success ? <p className="admin-success">{success}</p> : null}

        <div className="admin-actions">
          <button type="submit" className="admin-btn admin-btn-secondary" disabled={loading}>
            Save draft
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={loading}
            onClick={() => void handleSave(true)}
          >
            Publish to Telegram
          </button>
        </div>
      </form>
    </>
  );
}

export default function NewPostPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewPostForm />
    </Suspense>
  );
}
