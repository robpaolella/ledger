import type { CSSProperties } from 'react';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';

/**
 * Thin wrapper around emoji-picker-react so the whole library lands in a
 * lazy-loaded chunk (only fetched when a picker is opened). Colors are mapped
 * to Ledger's semantic tokens via emoji-picker-react's `--epr-*` CSS variables
 * so it matches the app in both light and dark mode.
 */
const eprTheme: CSSProperties = {
  '--epr-bg-color': 'var(--surface)',
  '--epr-category-label-bg-color': 'var(--surface)',
  '--epr-text-color': 'var(--text)',
  '--epr-hover-bg-color': 'var(--surface-2)',
  '--epr-focus-bg-color': 'var(--surface-2)',
  '--epr-highlight-color': 'var(--primary)',
  '--epr-search-input-bg-color': 'var(--surface-2)',
  '--epr-search-input-text-color': 'var(--text)',
  '--epr-search-input-placeholder-color': 'var(--text-3)',
  '--epr-search-border-color': 'var(--line-strong)',
  '--epr-picker-border-color': 'var(--line-strong)',
  '--epr-category-icon-active-color': 'var(--primary)',
  '--epr-emoji-hover-color': 'var(--surface-2)',
  '--epr-header-padding': '12px',
  '--epr-horizontal-padding': '12px',
  border: 'none',
} as CSSProperties;

export default function EmojiPickerPopover({ onPick }: { onPick: (emoji: string) => void }) {
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    <EmojiPicker
      onEmojiClick={(d) => onPick(d.emoji)}
      theme={dark ? Theme.DARK : Theme.LIGHT}
      emojiStyle={EmojiStyle.NATIVE}
      lazyLoadEmojis
      skinTonesDisabled
      previewConfig={{ showPreview: false }}
      width="100%"
      height={360}
      style={eprTheme}
    />
  );
}
