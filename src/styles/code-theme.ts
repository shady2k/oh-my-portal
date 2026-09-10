/**
 * The syntax theme — design §12.
 *
 * Shiki emits token colours as inline styles, so they cannot come from
 * `tokens.css` the way every other colour on the site does. This file is where
 * they live instead, and it is the only place in the engine that names a colour
 * outside that stylesheet.
 *
 * The palette is the tag palette, darkened until it is text rather than a
 * background: the same six hues carry code that carry topics, so a code block
 * belongs to the page instead of arriving from a different design. Every value
 * clears AA on `--paper-sunk`, which is the ground a block is set on.
 *
 * Deliberately few scopes. A theme with forty rules is a theme nobody can hold
 * in their head, and the extra thirty-five distinguish things a reader of a
 * homelab article never needed distinguished.
 *
 * The background is absent on purpose — a transformer drops the wrapper's inline
 * style so `--paper-sunk` stays the single source for it (astro.config.mjs).
 */

/** Tag mint, as text. Strings: the most common coloured run in a shell block. */
const GREEN = '#2f6b45';
/** Tag lavender. Keywords and control flow. */
const VIOLET = '#5d4c96';
/** Tag sky. Functions and the names of things being called. */
const BLUE = '#2a5d92';
/** Tag rose. Types and class names. */
const MAGENTA = '#93375f';
/** Tag peach. Numbers, booleans, and language constants. */
const RUST = '#96522a';

/** Matches `--ink` and `--ink-quiet`; kept literal because Shiki needs hex. */
const INK = '#17171c';
const QUIET = '#6e6e7a';

export const codeTheme = {
  name: 'oh-my-portal',
  type: 'light' as const,
  colors: {
    'editor.foreground': INK,
  },
  settings: [
    { settings: { foreground: INK } },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: QUIET, fontStyle: 'italic' },
    },
    {
      scope: ['string', 'string.quoted', 'punctuation.definition.string', 'meta.embedded.line'],
      settings: { foreground: GREEN },
    },
    {
      scope: ['keyword', 'storage', 'storage.type', 'keyword.control', 'keyword.operator.new'],
      settings: { foreground: VIOLET },
    },
    {
      scope: ['constant.numeric', 'constant.language', 'constant.character', 'support.constant'],
      settings: { foreground: RUST },
    },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function-call'],
      settings: { foreground: BLUE },
    },
    {
      scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.name.tag'],
      settings: { foreground: MAGENTA },
    },
    {
      /* YAML and TOML keys, and JSON property names: what a config block is
         mostly made of, so it earns a colour of its own. */
      scope: ['entity.name.tag.yaml', 'support.type.property-name', 'variable.other.key'],
      settings: { foreground: BLUE },
    },
    {
      scope: ['punctuation', 'meta.brace', 'keyword.operator'],
      settings: { foreground: QUIET },
    },
  ],
};
