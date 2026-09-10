import assert from 'node:assert/strict';
import test from 'node:test';
import { pdfPreviewPages } from '../src/lib/pdf-preview-pages';

test('manual preview alternates matching sheets from separate front and back PDFs', () => {
  assert.deepEqual(pdfPreviewPages(2, 2, 'manual'), [
    { document: 0, page: 1, label: 'Sheet 1 · Front' },
    { document: 1, page: 1, label: 'Sheet 1 · Back' },
    { document: 0, page: 2, label: 'Sheet 2 · Front' },
    { document: 1, page: 2, label: 'Sheet 2 · Back' },
  ]);
});

test('duplex preview labels alternating pages in a single PDF', () => {
  assert.deepEqual(pdfPreviewPages(4, 0, 'duplex'), [
    { document: 0, page: 1, label: 'Sheet 1 · Front' },
    { document: 0, page: 2, label: 'Sheet 1 · Back' },
    { document: 0, page: 3, label: 'Sheet 2 · Front' },
    { document: 0, page: 4, label: 'Sheet 2 · Back' },
  ]);
});

test('front-only preview includes every sheet and no back pages', () => {
  assert.deepEqual(pdfPreviewPages(2, 2, 'front'), [
    { document: 0, page: 1, label: 'Sheet 1 · Front' },
    { document: 0, page: 2, label: 'Sheet 2 · Front' },
  ]);
  assert.deepEqual(pdfPreviewPages(0, 0, 'front'), []);
});
