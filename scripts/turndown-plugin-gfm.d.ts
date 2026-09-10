/**
 * `turndown-plugin-gfm` ships no types and has no entry in DefinitelyTyped.
 *
 * Only the table support is used, and only by the one-time Ghost importer: ten
 * tables across the migrated articles that would otherwise arrive as HTML
 * embedded in markdown. Declaring the one export that is called is honest about
 * how much of the plugin this repository actually depends on — a blanket `any`
 * module would hide the day it changes shape.
 */
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
