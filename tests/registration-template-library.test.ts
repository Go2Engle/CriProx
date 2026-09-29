import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { loadRegistrationTemplate, registrationTemplateFilename, saveRegistrationTemplate } =
  require('../electron/registration-template-library.cjs') as {
    loadRegistrationTemplate: (
      root: string,
      request: { templateId: string; slotCount: number; target?: 'cricut' | 'silhouette' },
    ) => Promise<{ name: string; capturedAt: string; pdf: ArrayBuffer } | null>;
    registrationTemplateFilename: (
      templateId: string,
      slotCount: number,
      target?: 'cricut' | 'silhouette',
    ) => string;
    saveRegistrationTemplate: (
      root: string,
      request: {
        templateId: string;
        slotCount: number;
        target?: 'cricut' | 'silhouette';
        pdf: Uint8Array;
      },
    ) => Promise<{ name: string; capturedAt: string }>;
  };

const identity = { templateId: 'CP-1234ABCD', slotCount: 6 };

test('registration templates are saved and replaced at the project library root', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'criprox-template-library-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = new TextEncoder().encode('%PDF-1.7\nfirst');
  const second = new TextEncoder().encode('%PDF-1.7\nreplacement');

  const saved = await saveRegistrationTemplate(root, { ...identity, pdf: first });
  assert.equal(saved.name, 'CP-1234ABCD-6-cut-cricut-template.pdf');
  assert.deepEqual(await fs.readdir(root), [saved.name]);

  await saveRegistrationTemplate(root, { ...identity, pdf: second });
  const loaded = await loadRegistrationTemplate(root, identity);
  assert.equal(loaded?.name, saved.name);
  assert.deepEqual(new Uint8Array(loaded?.pdf || new ArrayBuffer(0)), second);
});

test('registered templates have distinct path-safe names', () => {
  assert.equal(
    registrationTemplateFilename('CP-1234ABCD', 4),
    'CP-1234ABCD-4-cut-silhouette-template.pdf',
  );
  assert.equal(
    registrationTemplateFilename('CP-1234ABCD', 6),
    'CP-1234ABCD-6-cut-cricut-template.pdf',
  );
  assert.equal(
    registrationTemplateFilename('CP-ABCDEF12', 7),
    'CP-ABCDEF12-7-cut-cricut-template.pdf',
  );
  assert.equal(
    registrationTemplateFilename('CP-ABCDEF12', 8),
    'CP-ABCDEF12-8-cut-cricut-template.pdf',
  );
  assert.equal(
    registrationTemplateFilename('CP-ABCDEF12', 8, 'silhouette'),
    'CP-ABCDEF12-8-cut-silhouette-template.pdf',
  );
  assert.throws(() => registrationTemplateFilename('CP-1234ABCD', 4, 'cricut'));
  assert.throws(() => registrationTemplateFilename('CP-1234ABCD', 7, 'silhouette'));
  assert.throws(() => registrationTemplateFilename('../escape', 6));
  assert.throws(() => registrationTemplateFilename('CP-1234ABCD', 9));
});

test('eight-card Silhouette capture has its own saved PDF', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'criprox-silhouette-template-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const request = {
    templateId: 'CP-ABCDEF12',
    slotCount: 8,
    target: 'silhouette' as const,
    pdf: new TextEncoder().encode('%PDF-1.7\nsilhouette'),
  };
  const saved = await saveRegistrationTemplate(root, request);
  assert.equal(saved.name, 'CP-ABCDEF12-8-cut-silhouette-template.pdf');
  const loaded = await loadRegistrationTemplate(root, request);
  assert.deepEqual(new Uint8Array(loaded?.pdf || new ArrayBuffer(0)), request.pdf);
});

test('registration template storage rejects non-PDF data', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'criprox-template-library-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    saveRegistrationTemplate(root, {
      ...identity,
      pdf: new TextEncoder().encode('not a pdf'),
    }),
    /must be a PDF/,
  );
  assert.deepEqual(await fs.readdir(root), []);
});
