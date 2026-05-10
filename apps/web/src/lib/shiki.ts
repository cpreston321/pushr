import type { HighlighterCore } from 'shiki/core';
import type { ThemeRegistrationRaw } from 'shiki';

/**
 * Custom shiki theme that pulls from the site's own palette so code blocks
 * look continuous with the rest of the docs page instead of like a pasted-in
 * GitHub Dark snippet. Mirrors the ink/wire/bone/signal/amber tokens defined
 * in index.css.
 */
// shiki accepts TextMate-format themes where `settings` is the array of token
// color rules (the VS Code alias `tokenColors` also works on some shapes, but
// `settings` is the canonical field — leaving it empty silently strips all
// highlighting). The first entry with no scope is the editor-wide default.
const pushrInkTheme: ThemeRegistrationRaw = {
  name: 'pushr-ink',
  type: 'dark',
  colors: {
    'editor.background': '#080d18',
    'editor.foreground': '#e8e0cb'
  },
  settings: [
    {
      settings: {
        background: '#080d18',
        foreground: '#e8e0cb'
      }
    },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#5d6b7e', fontStyle: 'italic' }
    },
    {
      scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
      settings: { foreground: '#ffb547' }
    },
    {
      scope: [
        'constant.numeric',
        'constant.language',
        'constant.language.boolean',
        'constant.language.null'
      ],
      settings: { foreground: '#5be9b9' }
    },
    {
      scope: [
        'keyword',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.operator.new',
        'keyword.operator.expression'
      ],
      settings: { foreground: '#79c0ff' }
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'meta.function-call',
        'meta.function-call entity.name.function'
      ],
      settings: { foreground: '#79c0ff' }
    },
    {
      scope: ['variable', 'variable.parameter', 'variable.other.readwrite'],
      settings: { foreground: '#e8e0cb' }
    },
    {
      scope: ['entity.name.tag', 'entity.name.type', 'support.class', 'support.type'],
      settings: { foreground: '#79c0ff' }
    },
    {
      scope: ['entity.other.attribute-name'],
      settings: { foreground: '#5be9b9' }
    },
    {
      scope: [
        'meta.object-literal.key',
        'support.type.property-name',
        'string.json support.type.property-name',
        'meta.structure.dictionary.json string.quoted.double.json'
      ],
      settings: { foreground: '#79c0ff' }
    },
    {
      scope: ['punctuation', 'meta.brace', 'meta.delimiter'],
      settings: { foreground: '#7a8896' }
    },
    {
      scope: ['keyword.operator'],
      settings: { foreground: '#a3b1c2' }
    },
    {
      scope: ['markup.heading', 'markup.bold'],
      settings: { foreground: '#79c0ff', fontStyle: 'bold' }
    },
    {
      scope: ['markup.inline.raw', 'markup.fenced_code'],
      settings: { foreground: '#5be9b9' }
    },
    // Bash / shell — flag args, paths, parameter expansions
    {
      scope: ['variable.parameter.option.shell', 'string.unquoted.argument'],
      settings: { foreground: '#a3b1c2' }
    },
    {
      scope: ['variable.other.normal.shell', 'variable.other.bracket.shell'],
      settings: { foreground: '#5be9b9' }
    }
  ]
};

const SUPPORTED_LANGS = new Set(['bash', 'shell', 'shellscript', 'json', 'jsonc', 'typescript']);

let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      // Dynamic-import shiki + grammars so they don't bloat the initial
      // Docs paint. The page renders code blocks as plain mono first, then
      // upgrades when this resolves.
      const [
        { createHighlighterCore },
        { createJavaScriptRegexEngine },
        bash,
        shellscript,
        json,
        jsonc,
        typescript
      ] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/shellscript.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/jsonc.mjs'),
        import('shiki/langs/typescript.mjs')
      ]);
      return createHighlighterCore({
        themes: [pushrInkTheme],
        langs: [bash.default, shellscript.default, json.default, jsonc.default, typescript.default],
        engine: createJavaScriptRegexEngine()
      });
    })();
  }
  return highlighterPromise;
}

export const SHIKI_THEME = 'pushr-ink';

export function normalizeLang(lang: string | undefined): string {
  if (!lang) return 'text';
  const l = lang.toLowerCase();
  if (l === 'sh') return 'bash';
  if (l === 'shell') return 'shellscript';
  // Treat js as typescript — the TS grammar is a superset and the docs only
  // show snippets, never full programs where the distinction matters.
  if (l === 'js' || l === 'javascript') return 'typescript';
  if (l === 'ts') return 'typescript';
  if (SUPPORTED_LANGS.has(l)) return l;
  return 'text';
}
