import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The client has no component test runner, so this guards the wiring in the source:
// the Edit asset window must delete only through the two-step ConfirmDeleteButton.
const source = readFileSync(new URL('../../client/src/pages/AccountsPage.tsx', import.meta.url), 'utf8');

describe('Edit asset window delete', () => {
  it('routes Delete through ConfirmDeleteButton, so the first click only asks', () => {
    expect(source).toContain("import ConfirmDeleteButton from '../components/ConfirmDeleteButton'");
    expect(source).toMatch(/<ConfirmDeleteButton[^>]*onConfirm=\{deleteAsset\}/);
  });

  it('never calls deleteAsset from a plain button', () => {
    expect(source).not.toMatch(/<button[^>]*onClick=\{deleteAsset\}/);
  });
});
