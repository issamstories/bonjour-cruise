# DIRTY GOLD — series bible

Static, self-contained site. No build step: `index.html` plus `assets/`.

## Deploying

The folder is deliberately excluded from the Bonjour Cruise vite build at the
repo root, so it never ships with bonjourcruise.com.

**Cloudflare Pages** (connect to Git):

| Setting                | Value                                   |
| ---------------------- | --------------------------------------- |
| Repository             | `issamstories/bonjour-cruise`           |
| Production branch      | `claude/dirty-gold-series-bible-s5wjlg` |
| Framework preset       | None                                    |
| Build command          | *(leave empty)*                         |
| Build output directory | `dirty-gold`                            |

**Netlify**: same repository and branch, base directory `dirty-gold`, no build
command. The `netlify.toml` in this folder already sets `publish = "."`.

## Confidentiality

The document is marked Strictly Confidential. `robots.txt` and the
`X-Robots-Tag` header keep it out of search indexes, but a public URL stays
readable by anyone holding the link. To actually gate it, put Cloudflare
Access (Zero Trust) in front of the Pages project and allow named email
addresses — free at this scale.
