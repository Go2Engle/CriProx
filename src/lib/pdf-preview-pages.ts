export type PreviewPage = { document: number; page: number; label: string };

export function pdfPreviewPages(
  frontCount: number,
  backCount: number,
  mode: 'front' | 'manual' | 'duplex',
): PreviewPage[] {
  if (mode === 'duplex') {
    return Array.from({ length: frontCount }, (_, index) => ({
      document: 0,
      page: index + 1,
      label: `Sheet ${Math.floor(index / 2) + 1} · ${index % 2 ? 'Back' : 'Front'}`,
    }));
  }
  const pages: PreviewPage[] = [];
  for (let index = 0; index < Math.max(frontCount, mode === 'manual' ? backCount : 0); index++) {
    if (index < frontCount)
      pages.push({ document: 0, page: index + 1, label: `Sheet ${index + 1} · Front` });
    if (mode === 'manual' && index < backCount)
      pages.push({ document: 1, page: index + 1, label: `Sheet ${index + 1} · Back` });
  }
  return pages;
}
