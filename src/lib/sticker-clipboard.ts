import {
  stickerPoses,
  stickerBounds,
  validateStickerProject,
  type StickerProject,
  type StickerArtwork,
  type StickerPose,
} from './stickers';
export type StickerClipboard = { artwork: StickerArtwork; pose: StickerPose };
/** Library paste duplicates editable artwork without adding or moving sheet copies. */
export function pasteStickerDesign(
  project: StickerProject,
  source: StickerArtwork,
  newId: () => string = () => crypto.randomUUID(),
): StickerProject {
  return validateStickerProject({
    ...project,
    artwork: [
      ...project.artwork,
      { ...structuredClone(source), id: newId(), name: `${source.name.slice(0, 195)} copy` },
    ],
  });
}
export function copySticker(project: StickerProject, index: number): StickerClipboard | undefined {
  const artwork = project.artwork.find((a) => a.id === project.items[index]),
    pose = stickerPoses(project)[index];
  return artwork && pose ? { artwork: structuredClone(artwork), pose: { ...pose } } : undefined;
}
export function pasteSticker(
  project: StickerProject,
  clip: StickerClipboard,
  page: number,
  newId: () => string = () => crypto.randomUUID(),
): StickerProject {
  const existing = project.artwork.find(
    (a) => a.id === clip.artwork.id && a.image === clip.artwork.image,
  );
  const artwork = existing ?? { ...clip.artwork, id: newId() };
  const b = stickerBounds(clip.pose);
  if (b.width > project.settings.areaWidth || b.height > project.settings.areaHeight)
    throw Error(
      'The copied sticker is larger than this sheet. Increase the sheet area before pasting.',
    );
  const pose = {
    ...clip.pose,
    sheet: page,
    x: Math.max(0, Math.min(clip.pose.x + 3, project.settings.areaWidth - b.width)),
    y: Math.max(0, Math.min(clip.pose.y + 3, project.settings.areaHeight - b.height)),
  };
  return validateStickerProject({
    ...project,
    version: 2,
    capture: undefined,
    artwork: existing ? project.artwork : [...project.artwork, artwork],
    items: [...project.items, artwork.id],
    poses: [...stickerPoses(project), pose],
  });
}
