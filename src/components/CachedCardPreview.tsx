import { useEffect, useRef, useState } from 'react';
import { previewImageCache } from '../lib/preview-image-cache';

export default function CachedCardPreview({ source, name }: { source: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<{ source: string; url: string }>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: ref.current.closest('.card-search-content'), rootMargin: '200px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setFailed(false);
    void previewImageCache
      .get(source)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ source, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, visible, retry]);

  return (
    <div className="cached-card-preview" ref={ref}>
      {preview?.source === source ? (
        <img src={preview.url} alt="" />
      ) : failed ? (
        <button
          className="secondary compact"
          aria-label={`Retry preview for ${name}`}
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry preview
        </button>
      ) : (
        <span className="muted">Preview loading…</span>
      )}
    </div>
  );
}
