# Invite links, per-person reminders, and three fixes

**Date:** 2026-10-06
**Branch:** `feat/invites-and-fixes`
**Built by:** #3, from Dana's list of five issues.

## What each issue turned out to be

Each was reproduced before anything changed. Two turned out not to be the
bug they looked like.

| Issue | What was really going on | What changed |
|---|---|---|
| Gmail stopped fetching | **Not a regression.** Google answered `invalid_grant`: an OAuth app in *Testing* has its tokens expire after **7 days**, and the connection was 9 days old. Gmail was also never configured on the live site. | Clearer wording: a failed check no longer says "Nothing new" beside "Connect again", and the note says *why*. `deployment.md`: reconnect on the day of a demo. Dana chose to stay in Testing. |
| Can't add people by email | Adding a **registered** user worked, even with capitals or spaces. Three real gaps: creating a group had **no email field**; there was **no way in for someone without an account** (the app has never sent email); and **the live site and a laptop have separate users**. | **Invite links** (below), an email list in "create a group", and an invite offer wherever an email finds nobody. |
| Reminders don't work | They did, end to end. The rule "only someone who owes *you*" was already enforced by the server. | **Per-person Remind** on each debt owed to you, as Dana asked. "Everyone" is offered only when more than one person owes you. |
| Back from a notification goes to the group | Confirmed: the expense page's back arrow was hard-wired to the group. | A notification row says where it was opened from, the `/expenses/:id` redirect passes that on, and back returns to Alerts. |
| Git cleanup | Already mostly done: 83 deleted the 8 merged remote branches. | Kept: Hila's `docs/final-report`, the draft `docs/report`, and 37's local `feat/demo-script`. |

## Invite links

- `group_invites` (migration `d387a6e4d1c5`).
- Any member may share the group's one link:
  - 32 random characters;
  - lasts **14 days**;
  - the same link comes back until it is renewed, and renewing retires the
    old one at once.
- Opening a link needs an account and shows only the group's name and who
  invited. Members and money stay for members.
- **The link travels without the app sending mail**: WhatsApp (`wa.me`),
  the person's own email app (`mailto:`), copy, or the phone's share sheet.
- **Sign-up now keeps `?next=`.** Someone invited who has no account signs
  up and lands back on the invite, not on the Gmail offer. `next` is
  accepted only as an in-app path, so it can't send anyone off-site.

## Tests

- Backend: 17 new tests for invites.
- Frontend: 9 new tests for invites (sharing, the not-found email turning
  into an invite, creating a group with emails, joining, sign-up returning
  to the link), 2 for per-person reminders, 1 for the expired Gmail
  message, and 1 for back-to-Alerts.
- The back-to-Alerts test was checked to fail with the old code.

## Surprises

- In the tests, one database session is shared across requests, so after
  `accept` the group still held its old member list. The service now
  refreshes the group after joining.
- "WhatsApp" had to be added to the list of words the Hebrew catalogue may
  leave untranslated.
