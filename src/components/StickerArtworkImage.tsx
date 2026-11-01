import { useEffect, useState } from 'react';
import { stickerArtworkFrame, stickerArtworkInfo, type ArtworkInfo } from '../lib/sticker-artwork';
import type { StickerPose, StickerSettings } from '../lib/stickers';

/** Sheet preview uses the same measured source crop and fit as the print renderer. */
export default function StickerArtworkImage({
  source,
  pose,
  settings,
  custom,
}: {
  source: string;
  pose: StickerPose;
  settings: StickerSettings;
  custom: boolean;
}) {
  const [measured, setMeasured] = useState<{ source: string; info: ArtworkInfo }>();
  useEffect(() => {
    let active = true;
    void stickerArtworkInfo(source)
      .then((info) => {
        if (active) setMeasured({ source, info });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [source]);
  const info = measured?.source === source ? measured.info : undefined;
  if (!info)
    return (
      <image
        href={source}
        width={pose.width}
        height={pose.height}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  const frame = stickerArtworkFrame(info, pose, settings, custom);
  return (
    <svg
      x={frame.x}
      y={frame.y}
      width={frame.width}
      height={frame.height}
      viewBox={`${frame.source.x} ${frame.source.y} ${frame.source.width} ${frame.source.height}`}
      preserveAspectRatio="none"
    >
      <image href={source} width={info.width} height={info.height} />
    </svg>
  );
}
