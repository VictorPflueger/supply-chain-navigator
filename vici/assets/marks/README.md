# Other brands' logos

Logos of the platforms that Victor Pflüger's profiles live on. They belong to their owners and
are not part of Vici's licence (see `LICENSE`, section 4). Vici never redraws them.

| File | What it is | Source | Licence of the file |
|---|---|---|---|
| `github.svg` | GitHub's Invertocat | Octicons 19.39.0 (`@primer/octicons`, `build/svg/mark-github-24.svg`), unchanged | MIT, Copyright (c) 2026 GitHub Inc. (`OCTICONS-LICENSE`) |
| `linkedin.png` | LinkedIn's [in] logo, black | LinkedIn's brand downloads (<https://brand.linkedin.com/downloads>), unchanged | LinkedIn's brand guidelines and terms |
| `linkedin-white.png` | LinkedIn's [in] logo, white | as above | as above |
| `linkedin-blue.png` | LinkedIn's [in] logo, LinkedIn blue | as above | as above |

LinkedIn's files include the ® sign; keep it. Use the black file with `.vc-platform-mark`: in the
dark theme the class shows it white, exactly like `linkedin-white.png`. Where Vici's stylesheet
isn't loaded (Streamlit, email), pick the black or the white file yourself. LinkedIn's full
"LinkedIn" logo and its 领英 versions for China are for other uses than profile links, so they
aren't here.

The rules, in short (the Profile links page in the docs has the details):

- Use the files exactly as published: don't redraw them, don't recolour them, and don't put them
  into a hexagon, circle or square. The hexagon rule applies to Vici's own shapes, not to other
  brands' logos.
- Colours: black on light backgrounds and white on dark ones. `.vc-platform-mark` switches
  automatically, through `--vc-platform-mark` for inline SVG and `--vc-platform-mark-filter` for
  image files. LinkedIn also allows its own blue.
- Size: LinkedIn's [in] logo at least 21 px high, LinkedIn's minimum. GitHub's Invertocat at
  18 px, because GitHub asks for its logo to stay less prominent than your own name.
- Use them only to link to Victor's own profiles.
