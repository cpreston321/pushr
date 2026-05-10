/**
 * Single source of truth for the Changelog page. Newest release first.
 *
 * To ship a release: prepend a new entry, set the `date` to the ship day
 * (ISO YYYY-MM-DD), and group your bullets by `kind`. The page renders
 * every entry from this file — no parser, no markdown.
 *
 * Conventions:
 *   - `version` follows semver and is rendered as the section anchor
 *     (e.g. v1.1.0 → #/changelog/v1-1-0).
 *   - Keep each `text` to a single line, sentence case, no trailing period.
 *   - Reach for `pr` or `commit` only when the link genuinely helps.
 */

export type ChangeKind = 'added' | 'changed' | 'fixed' | 'removed' | 'security';

/**
 * Which shipping surface the change applies to. Most entries belong to one
 * surface; a few feature lifts touch several (e.g. a new field exposed in
 * both the SDK and the CLI). Omit `surfaces` for changes that apply
 * everywhere — the page will render them without a surface chip.
 */
export type Surface = 'app' | 'web' | 'sdk' | 'cli' | 'api';

export type Change = {
  kind: ChangeKind;
  text: string;
  surfaces?: Surface[];
  /** Optional GitHub PR number, rendered as a small "#123" link. */
  pr?: number;
};

export type Release = {
  version: string;
  /** ISO date string, e.g. "2026-05-08". */
  date: string;
  /** One-line headline. Skip if the version is a small patch. */
  title?: string;
  /** Optional yanked/notice flag with reason. */
  yanked?: string;
  changes: Change[];
};

export const RELEASES: Release[] = [
  {
    version: 'v0.0.1',
    date: '2026-05-08',
    title: 'First cut',
    changes: [
      {
        kind: 'added',
        surfaces: ['web'],
        text: 'Public API reference at /docs with Shiki syntax highlighting and a sticky TOC that tracks the active section'
      },
      {
        kind: 'added',
        surfaces: ['web'],
        text: 'Interactive POST /notify panel on the docs page — paste a token, fire a real request, see status + latency + body inline'
      },
      {
        kind: 'added',
        surfaces: ['app'],
        text: 'Inline image attachments now render as thumbnails on feed rows (server already accepted them; only the in-app rendering was missing)'
      },
      {
        kind: 'added',
        surfaces: ['web'],
        text: 'Changelog page (this one)'
      },
      {
        kind: 'changed',
        surfaces: ['app'],
        text: "Token-reveal screen rebuilt — destructive shield accent, 'shown once' callout, and a two-tap interlock if you try to dismiss without copying"
      },
      {
        kind: 'changed',
        surfaces: ['app'],
        text: 'Empty feed view simplified — removed the test-push CTA and now just points users at the Apps tab'
      },
      {
        kind: 'fixed',
        surfaces: ['api'],
        text: 'Pro tier retention honors the 90-day window the upgrade screen promises (was hard-coded to 30 days for everyone)'
      },
      {
        kind: 'fixed',
        surfaces: ['web'],
        text: 'Docs sidebar and inline anchor links no longer bounce back to the homepage — anchors are now nested under the docs route'
      },
      {
        kind: 'fixed',
        surfaces: ['web'],
        text: 'Priority toggle in the Try-It panel no longer shifts surrounding layout when changed'
      },
      {
        kind: 'fixed',
        surfaces: ['web'],
        text: 'Code block line-spacing in the docs page (Shiki line spans were double-spacing against the preserved newlines)'
      }
    ]
  }
];
