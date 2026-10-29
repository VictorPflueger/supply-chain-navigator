# Vici, copied into this prototype

These files come unchanged from Vici, Victor Pflüger's design system
(<https://victorpflueger.github.io/ViciDesign/index.html>), version **v1.0.0** (commit `fdd868b` on its main branch).
The prototype loads them from here rather than from a CDN, so every page is served from this site alone.

| File here | What it is |
|---|---|
| `dist/vici.min.css` | Vici's stylesheet: tokens, light and dark theme, components, icons |
| `dist/vici.js` | Vici's small script: theme toggle, tooltips, and the behaviours of its components |
| `dist/tokens.json` | Vici's token values, light and dark, for scripts and tests (the colour checks read it) |
| `assets/fonts/*.woff2` | Bricolage Grotesque, Inter, JetBrains Mono and Vici Mask, as the stylesheet expects them |
| `assets/fonts/OFL-*.txt` | The SIL Open Font License of each font family |
| `assets/marks/linkedin.png` | LinkedIn's [in] logo, as LinkedIn publishes it |
| `assets/marks/README.md` | Where the marks come from and how they may be used (it also names marks this copy leaves out) |
| `assets/brand/portrait-96.jpg` | Victor's portrait, 96 × 96 px, for the byline |
| `LICENSE` | Vici's licence |

Keep the folder structure: the stylesheet finds the fonts at `../assets/fonts/`. Never edit these
files; a fix belongs in Vici, and comes here with its next release.

**Licence.** `LICENSE` covers all of it: Vici's code and its Vici Mask font are MIT-licensed;
Bricolage Grotesque, Inter and JetBrains Mono are under the SIL Open Font License; Victor Pflüger's
name, portrait and logo are reserved for his own use; LinkedIn's logo belongs to LinkedIn.

**Updating.** Copy the same files from a newer Vici release (from its `dist/` and `assets/` folders,
and `LICENSE`) over these, and change the version and commit above. Then run the tests and look at
the prototype in light and dark: a new release may rename a class or change a token.
