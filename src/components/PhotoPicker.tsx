import { useEffect, useState } from 'react';
import { api, getUploadsBase, MediaItem, PexelsPhoto } from '../api/client';
import Modal from './Modal';

type Props = {
  value: string;
  onChange: (path: string) => void;
  suggestedQuery?: string;
  label?: string;
};

type Tab = 'library' | 'pexels' | 'upload';

export default function PhotoPicker({
  value,
  onChange,
  suggestedQuery = '',
  label = 'Photo',
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('library');
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState(suggestedQuery);
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);

  const uploads = getUploadsBase();
  const previewSrc = value ? `${uploads}/${value}` : '';

  const loadLibrary = async () => {
    const items = await api.getMediaLibrary();
    setLibrary(items);
  };

  useEffect(() => {
    if (!open) return;
    setQuery(suggestedQuery);
    setError(null);
    loadLibrary().catch((err) => setError(err.message));
    api
      .getSettings()
      .then((s) => setHasKey(Boolean(s.settings.pexels_api_key)))
      .catch(() => undefined);
  }, [open, suggestedQuery]);

  const searchPexels = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await api.searchPexels(query.trim() || suggestedQuery || 'product');
      setPhotos(result.photos);
      if (!result.photos.length) setError('No photos found');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setPhotos([]);
    } finally {
      setBusy(false);
    }
  };

  const downloadPhoto = async (photo: PexelsPhoto) => {
    setBusy(true);
    setError(null);
    try {
      const item = await api.downloadPexels({
        photoId: photo.id,
        imageUrl: photo.download,
        photographer: photo.photographer,
        alt: photo.alt,
      });
      await loadLibrary();
      onChange(item.path);
      setTab('library');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const item = await api.uploadMedia(file);
      await loadLibrary();
      onChange(item.path);
      setTab('library');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const removeFromLibrary = async (id: number) => {
    if (!confirm('Remove this image from the library?')) return;
    await api.deleteMedia(id);
    await loadLibrary();
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div className="photo-picker-row">
        <div className={`photo-preview ${value ? '' : 'empty'}`}>
          {value ? <img src={previewSrc} alt="" /> : <span>No photo</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            Choose {label.toLowerCase()}
          </button>
          {value && (
            <button type="button" className="btn" onClick={() => onChange('')}>
              Clear
            </button>
          )}
        </div>
      </div>

      <Modal
        title="Photo library"
        open={open}
        onClose={() => setOpen(false)}
        wide
        footer={
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Done
          </button>
        }
      >
        <div className="chips" style={{ padding: 0, border: 0, marginBottom: '0.85rem' }}>
          <button
            type="button"
            className={`chip ${tab === 'library' ? 'active' : ''}`}
            onClick={() => setTab('library')}
          >
            Library
          </button>
          <button
            type="button"
            className={`chip ${tab === 'pexels' ? 'active' : ''}`}
            onClick={() => setTab('pexels')}
          >
            Pexels
          </button>
          <button
            type="button"
            className={`chip ${tab === 'upload' ? 'active' : ''}`}
            onClick={() => setTab('upload')}
          >
            Upload
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {tab === 'library' && (
          <div className="media-grid">
            {library.map((item) => (
              <div
                key={item.id}
                className={`media-tile ${value === item.path ? 'selected' : ''}`}
                onClick={() => onChange(item.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onChange(item.path);
                }}
                role="button"
                tabIndex={0}
              >
                <img src={`${uploads}/${item.path}`} alt={item.alt || ''} />
                <span>{item.source === 'pexels' ? 'Pexels' : 'Upload'}</span>
                <button
                  type="button"
                  className="media-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromLibrary(item.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {!library.length && (
              <div className="empty">Library is empty — search Pexels or upload a file</div>
            )}
          </div>
        )}

        {tab === 'pexels' && (
          <div>
            {!hasKey && (
              <div className="notice">
                Add your Pexels API key under Settings → Media before searching.
              </div>
            )}
            <div className="filters">
              <div className="field" style={{ flex: 1, minWidth: 200 }}>
                <label>Search Pexels</label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') searchPexels();
                  }}
                  placeholder={suggestedQuery || 'coffee, fruit, sandwich…'}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={searchPexels}
                disabled={busy || !hasKey}
              >
                {busy ? 'Searching…' : 'Search'}
              </button>
            </div>
            <div className="media-grid">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className="media-tile"
                  disabled={busy}
                  onClick={() => downloadPhoto(photo)}
                  title={`Photo by ${photo.photographer}`}
                >
                  <img src={photo.preview} alt={photo.alt} />
                  <span>Save · {photo.photographer}</span>
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
              Photos are downloaded into your local library, then used offline on the till.
            </p>
          </div>
        )}

        {tab === 'upload' && (
          <div className="field">
            <label>Upload image to library</label>
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
