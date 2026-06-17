'use client';

import { useRef, useState } from 'react';
import { fileToPendingImage, type PendingChannelPostImage } from '../../../../lib/adminClient';

type PostImageFieldProps = {
  previewUrl?: string | null;
  imageUrl?: string;
  onImageUrlChange?: (value: string) => void;
  onPendingImageChange: (image: PendingChannelPostImage | null) => void;
  onRemoveExisting?: () => void;
  disabled?: boolean;
};

export default function PostImageField({
  previewUrl,
  imageUrl = '',
  onImageUrlChange,
  onPendingImageChange,
  onRemoveExisting,
  disabled,
}: PostImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  const shownPreview = localPreview || previewUrl || null;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');
    if (!file) return;

    try {
      const pending = await fileToPendingImage(file);
      setLocalPreview(pending.previewUrl);
      onPendingImageChange(pending);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read image');
      onPendingImageChange(null);
    }
  }

  function handleRemove() {
    setError('');
    setLocalPreview(null);
    onPendingImageChange(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemoveExisting?.();
  }

  return (
    <div className="admin-field">
      <label>Image (optional)</label>
      {shownPreview ? (
        <div className="admin-image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shownPreview} alt="Post preview" />
          <button type="button" className="admin-btn admin-btn-secondary" disabled={disabled} onClick={handleRemove}>
            Remove image
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={disabled}
        onChange={(event) => void handleFileChange(event)}
      />
      <small>Upload a photo to send with the Telegram post (max 5 MB).</small>

      {onImageUrlChange ? (
        <>
          <label htmlFor="imageUrl" style={{ marginTop: '0.75rem' }}>
            Or image URL
          </label>
          <input
            id="imageUrl"
            value={imageUrl}
            disabled={disabled || Boolean(localPreview)}
            onChange={(e) => onImageUrlChange(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
          <small>Use a public https:// link if you already host the image elsewhere.</small>
        </>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}
    </div>
  );
}
