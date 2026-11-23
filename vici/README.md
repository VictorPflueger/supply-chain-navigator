# Vici, copied into this prototype

These files come unchanged from Vici, Victor Pflüger's design system
(<https://victorpflueger.github.io/ViciDesign/index.html>), from its main branch at commit **`7150ac4`**
(23 November 2026), on the way to Vici 2.0. That commit brings the How it works guide (`vc-guide`),
the 2.0 byline, the rule that the How it works chapter explains every key figure, a key figure's old
value struck through when a decision moves it (`vc-stat__was`), the AI notice for a live run, the
brief for building a prototype with its rule that a bar asks for every click, `vc-attention` for the
one action the page waits for, and the rules from #16 to #21: names, not record ids; a figure from
part of the data says so; the figures answer first; a stopped clock says it stopped; the talk track
says each figure as its tile does; the bar never covers what it asks about, and a live run's button
says live. This showcase follows all of them. Its files still call themselves 1.0.0 until 2.0 is
released.
The prototype loads them from here rather than from a CDN, so every page is served from this site alone.

| File here | What it is |
|---|---|
| `dist/vici.min.css` | Vici's stylesheet: tokens, light and dark theme, components, icons |
| `dist/vici.js` | Vici's small script: theme toggle, tooltips, the How it works guide and the behaviours of its components |
| `dist/tokens.json` | Vici's token values, light and dark, for scripts and tests |
| `assets/fonts/*.woff2` | Bricolage Grotesque, Inter, JetBrains Mono and Vici Mask, as the stylesheet expects them |
| `assets/fonts/OFL-*.txt` | The SIL Open Font License of each font family |
| `assets/marks/linkedin.png` | LinkedIn's [in] logo, as LinkedIn publishes it |
| `assets/marks/README.md` | Where the marks come from and how they may be used (it also names marks this copy leaves out) |
| `assets/brand/portrait-96.jpg` | Victor's portrait, 96 × 96 px, for the byline |
| `LICENSE` | Vici's licence |

Keep the folder structure: the stylesheet finds the fonts at `../assets/fonts/`. Never edit these
files; a fix belongs in Vici, and comes here with its next release. `tests/files.mjs` compares every
file with ViciDesign at the commit above.

**Licence.** `LICENSE` covers all of it: Vici's code and its Vici Mask font are MIT-licensed;
Bricolage Grotesque, Inter and JetBrains Mono are under the SIL Open Font License; Victor Pflüger's
name, portrait and logo are reserved for his own use; LinkedIn's logo belongs to LinkedIn.

**Updating.** Copy the same files from a newer commit on Vici's main branch, or from the 2.0 release
when it is tagged (from its `dist/` and `assets/` folders, and `LICENSE`), over these; change the
commit above and in the GitHub Actions workflow; then run the tests and look at the page in light
and dark.
