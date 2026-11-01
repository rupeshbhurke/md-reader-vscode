# Theme and layout file formats

MD Reader's reading style has two independent parts, each a plain JSON file you can write by hand, share, or contribute by pull request:

- a **colour theme** (`*.mdtheme.json`, in `themes/`) — 24 colours;
- a **layout** (`*.mdlayout.json`, in `layouts/`) — heading and paragraph typography and spacing.

Any theme works with any layout. Body font, font size, line height and reading width are **not** part of either: they stay your own settings in the drawer, because they are personal accessibility preferences.

Every value is validated when a file is read. Anything invalid (unknown key, wrong type, out of range, a colour that isn't hex/`rgb()`/`hsl()`) is silently dropped and the default is used, so a bad or hostile file can break nothing. Tests check that the files shipped in this repo contain no unknown keys.

## Colour theme: `themes/<id>.mdtheme.json`

```json
{
  "mdReaderTheme": 2,
  "id": "nord",
  "label": "Nord",
  "base": "dark",
  "category": "Dark",
  "author": "MD Reader starter pack",
  "version": "1.0.0",
  "colors": {
    "surfaces": { "page": "#2e3440", "alt": "#3b4252", "panel": "#353c4a", "quote": "#333a47", "stripe": "#323946" },
    "lines":    { "border": "#4c566a" },
    "ink":      { "primary": "#e5e9f0", "muted": "#aab3c5" },
    "emphasis": { "link": "#88c0d0", "selection": "#434c5e" },
    "code":     { "inlineBackground": "#3b4252", "inlineText": "#ebcb8b", "blockBackground": "#242933", "blockText": "#d8dee9" },
    "syntax":   { "keyword": "#81a1c1", "string": "#a3be8c", "comment": "#7b88a1", "number": "#b48ead", "title": "#88c0d0",
                  "type": "#8fbcbb", "variable": "#d08770", "attr": "#8fbcbb", "meta": "#81a1c1", "builtIn": "#ebcb8b" }
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `mdReaderTheme` | yes | Format version. `2` is current; `1` files are still read. A higher number is refused ("made by a newer version"). |
| `id` | for `themes/` files | Lowercase letters, digits and `-`, up to 40 characters; must equal the file name. |
| `label` | yes | Shown in the dropdown, up to 40 characters. |
| `base` | yes | `light`, `dark` or `sepia`: the built-in theme any colour you leave out falls back to. |
| `category` | no | Dropdown group for starter themes (`Light`, `Dark`, `Accessible`, …). Up to 24 characters. |
| `author` | no | Credit, up to 60 characters. Kept through export and import. |
| `version` | no | The theme's own revision, e.g. `1.2.0`, so a shipped theme can be improved over time. |
| `colors` | yes | Any subset of the colours below. |
| `from` | no | *Saved themes only* (in `mdReader.customThemes`, not in files you write or export): the id of a starter theme this one tweaks. `colors` then holds only your changes and everything else, including `base`, follows the starter. Export writes the resolved colours and omits `from`. |

### Colours

A theme sets only the colours it wants; the rest come from `base`. The grouped names above are the file shape. In memory, in your settings (`mdReader.customThemes`) and in the editor they are the equivalent flat keys, and **both shapes are accepted everywhere**, mixed or not (a flat key wins if both name the same colour).

| Group | Name | Flat key | Drives |
|---|---|---|---|
| `surfaces` | `page` | `bg` | page background |
| | `alt` | `bgAlt` | alternate background, table header |
| | `panel` | `surface` | settings drawer, table of contents |
| | `quote` | `quoteBg` | blockquote background |
| | `stripe` | `tableStripe` | table row stripes |
| `lines` | `border` | `border` | borders and rules |
| `ink` | `primary` | `text` | body text |
| | `muted` | `textMuted` | secondary text |
| `emphasis` | `link` | `accent` | links, progress bar, blockquote border |
| | `selection` | `selection` | text selection |
| `code` | `inlineBackground` / `inlineText` | `codeBg` / `codeText` | inline `code` |
| | `blockBackground` / `blockText` | `preBg` / `preText` | code blocks |
| `syntax` | `keyword` `string` `comment` `number` `title` `type` `variable` `attr` `meta` `builtIn` | `hlKeyword` … `hlBuiltIn` | code-block syntax colours |

Colour values: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`/`hsl()`/`hsla()`. Nothing else (no names, no `var()`, no `url()`).

Keep text, link, code and syntax colours at WCAG AA contrast (body text AAA); `npm test` checks this for every file in `themes/`. The syntax colours assume the code-block background, so a light theme should have a light `blockBackground`.

An **export bundle** is the same thing wrapped as `{ "mdReaderTheme": 2, "themes": [ { … }, { … } ] }`; a single bare theme object (as above) is also accepted on import.

## Layout: `layouts/<id>.mdlayout.json`

```json
{
  "mdReaderLayout": 1,
  "id": "book",
  "label": "Book",
  "author": "MD Reader starter pack",
  "version": "1.0.0",
  "headings": {
    "font": "Georgia, 'Times New Roman', serif",
    "weight": 700,
    "lineHeight": 1.25,
    "spaceBefore": 2,
    "spaceAfter": 0.6,
    "scale": { "h1": 2.1, "h2": 1.6, "h3": 1.3, "h4": 1.12, "h5": 1, "h6": 0.92 },
    "rules": { "h1": 0, "h2": 0 }
  },
  "paragraphs": { "space": 0.3, "indent": 1.5 }
}
```

| Key | Unit | Range | Meaning |
|---|---|---|---|
| `headings.font` | — | font-family list, ≤120 chars of letters, digits, spaces and `, ' " . _ -` | heading font; omit to use the interface font |
| `headings.weight` | — | 300–900 | |
| `headings.lineHeight` | — | 1–2.2 | |
| `headings.spaceBefore` / `spaceAfter` | em | 0–5 / 0–3 | space above / below each heading |
| `headings.scale.h1` … `h6` | em | 0.6–4 | heading sizes relative to the body size |
| `headings.rules.h1` / `h2` | px | 0–6 | rule under h1 / h2 (`0` = none) |
| `paragraphs.space` | em | 0–3 | space between paragraphs |
| `paragraphs.indent` | em | 0–4 | first-line indent |

`standard` mirrors the defaults in `src/webview/reader.css` exactly (a test enforces it), and every shipped layout defines every numeric value so switching layouts never leaves a stray value behind. `mdReader.layout` in `package.json` lists the shipped layout ids; add the new id there when you add a file (a test enforces that too).

## Adding one

1. Copy an existing file in `themes/` or `layouts/`, change the `id`, `label` and values, and name the file `<id>.mdtheme.json` / `<id>.mdlayout.json`.
2. For a layout, add the id to the `mdReader.layout` enum in `package.json`.
3. Run `npm test`.
4. Add a CHANGELOG line and open a pull request.
