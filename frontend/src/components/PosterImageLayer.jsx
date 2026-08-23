import { useEffect, useState } from 'react';
import { getCuratedPoster } from '../posterImages.js';

/**
 * Absolutely-positioned image + gradient layer, meant to sit inside an
 * already `position: relative` (and ideally `overflow: hidden`) box that
 * keeps its own size/background as a fallback -- this never resizes the
 * box, it only lays an image + a transparent-to-solid gradient on top so
 * whatever text sits above it (via its own z-index) stays readable.
 *
 * Resolution order: an organiser-uploaded posterUrl wins; otherwise falls
 * back to a curated image for known titles; otherwise renders nothing at
 * all, leaving the box's existing default gradient visible. If the image
 * fails to load, it also falls back to nothing (the default gradient).
 */
export default function PosterImageLayer({ title, posterUrl, gradient }) {
  const url = posterUrl || getCuratedPoster(title);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [url]);

  if (!url || failed) return null;

  return (
    <>
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: gradient || 'linear-gradient(180deg, rgba(15,13,38,0.05) 0%, rgba(15,13,38,0.45) 55%, rgba(15,13,38,0.88) 100%)',
          zIndex: 0,
        }}
      />
    </>
  );
}
