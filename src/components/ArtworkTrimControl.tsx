import type { CardFace } from '../lib/types';
import { isEmbeddedArtwork } from '../lib/artwork';

export default function ArtworkTrimControl({
  face,
  change,
}: {
  face: CardFace;
  change: (enabled: boolean) => void;
}) {
  if (!isEmbeddedArtwork(face)) return null;
  const enabled = face.trim === 'mpc';

  return (
    <label className="switch-row artwork-trim-toggle">
      <span>
        Source has MPC-style print bleed
        <small>
          {enabled
            ? 'On · crop the outer print margin before fitting the card'
            : 'Off · use the whole image as the finished card'}
        </small>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        aria-label="Source has MPC-style print bleed"
        onChange={(event) => change(event.target.checked)}
      />
      <span className="switch" />
    </label>
  );
}
