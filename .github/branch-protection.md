# Protecting `main` (mission 0.6)

**Status: not enforced by GitHub yet.** `CLAUDE.md` says `main` is protected;
right now that is a convention we keep by hand, not a rule the server applies.

## Why it is not on

Both ways of protecting a branch were refused with the same message:

```
$ gh api -X PUT repos/galharel23/StudentWise/branches/main/protection --input ...
Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)

$ gh api -X POST repos/galharel23/StudentWise/rulesets --input .github/ruleset-main.json
Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)
```

Branch protection and repository rulesets are paid features on **private**
repositories. This repo is private and the account is on the Free plan.

## Three ways out, best first

1. **GitHub Student Developer Pack** — free GitHub Pro for students, and both of
   us have `.ac.il` addresses. Apply at
   <https://education.github.com/pack> with a student ID or enrolment letter;
   approval usually takes a day or two. Costs nothing and changes nothing else.
2. **Make the repo public.** Protection is free on public repos. Fine for a
   university project *provided* no real secret ever lands in it — and the dev
   `JWT_SECRET` in `.env.example` would then be readable by anyone, so it must
   never be the production one. (It must not be anyway.)
3. **Leave it as a convention.** Works with three people who talk to each other.
   It just is not enforced, so a tired `git push` to `main` at 2am will succeed.

## Turning it on, once Pro is active

```bash
gh api -X POST repos/galharel23/StudentWise/rulesets --input .github/ruleset-main.json
```

That is the whole job. `ruleset-main.json` next to this file is the rule we want:

- pull request required, **1 approving review**
- stale approvals dismissed when new commits are pushed
- comment threads must be resolved before merge
- **squash merge only**
- CI check `backend` must pass, and the branch must be up to date with `main`
- no force pushes, no deleting `main`
- repository **admins can bypass** (`bypass_actors`)

### Why admins can bypass

Until both teammates are on the repo there is nobody to approve Gal's pull
requests, and a rule that blocks the only active contributor gets turned off
rather than followed. Once all three of us are contributing, drop the
`bypass_actors` array and re-apply — that is the version worth having in the
report.

Verify afterwards:

```bash
gh api repos/galharel23/StudentWise/rulesets
gh api repos/galharel23/StudentWise/rules/branches/main
```
