# Publishing to GitHub

Run these from inside the unzipped project directory.

## With the GitHub CLI

```bash
cd btotd

git init -b main
git add -A
git commit -m "Big Top of the Dead: engine, weapons, enemies, campaign, tests"

# Creates the remote and pushes in one step. --public or --private.
gh repo create big-top-of-the-dead --public --source=. --remote=origin --push
```

Then:

```bash
gh repo edit --enable-issues --enable-projects=false
gh api -X POST repos/:owner/:repo/pages -f build_type=workflow   # enable Pages
```

If the Pages call errors, do it in the browser instead:
**Settings → Pages → Source → GitHub Actions**.

## Without the CLI

```bash
cd btotd
git init -b main
git add -A
git commit -m "Big Top of the Dead: engine, weapons, enemies, campaign, tests"
```

Create an empty repo on github.com (no README, no .gitignore, no licence —
this project already has all three), then:

```bash
git remote add origin git@github.com:YOUR_USER/big-top-of-the-dead.git
git push -u origin main
```

## Immediately after

1. **Fix the badges.** `README.md` has three badge URLs containing
   `USER/REPO`. Replace both segments.
2. **Enable Pages** — Settings → Pages → Source → GitHub Actions.
3. **Watch the first CI run.** It will almost certainly fail, and that is the
   point: this project has never been executed. The audit job passes locally,
   so any failure is either the build or the Playwright suite telling you
   something real.
4. **Branch protection is not worth it yet.** You're one person. Add it when
   a second contributor appears.

## What's in the repo

```
.github/workflows/ci.yml       audit + build, then Playwright, on push/PR/nightly
.github/workflows/deploy.yml   build and publish to Pages on main
.gitattributes                 LF normalisation, binary asset handling
.nvmrc                         Node 20, consumed by both workflows
.claude/settings.json          pre-approved read + dev-server permissions
CLAUDE.md                      architecture and invariants for Claude Code
README.md                      how it works and why
ASSETS.md                      where the CC0 packs come from
REVIEW.md                      the code review findings
LICENSE                        MIT
```

## Deliberately not included

- **Issue and PR templates.** Overhead before there's anyone to fill them in.
- **Dependabot.** The nightly CI run already catches dependency drift, and
  this project pins two libraries that rename fields between minor versions —
  automated bump PRs would be noise until the test suite is trusted.
- **Committed GLB assets.** They're large, freely re-downloadable, and
  gitignored. See the Git LFS note in the README if you want them tracked.
