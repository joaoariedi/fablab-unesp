# Fab Lab CITe — First Release: What's Done, What to Decide

As of 2026-10-17. A snapshot of the shared product document, where the Decision column is
filled in: <https://claude.ai/code/artifact/559ab8d6-1c3b-4c1a-bd94-5e99617db536>.

Most of the platform is built. Two things must happen before launch, and six items are
yours to decide: mark each one MVP (in the first release) or Nice to have (later).

## Already built

Everything below works today and needs no decision.

| What it does | Status |
|---|---|
| Each lab gets its own website, and its data stays separate from other labs | Done |
| A pixel-art look, with menus that work on phone and computer | Done |
| An admin panel where the team publishes projects, 3D models, lessons, articles and events | Done |
| Public pages anyone can visit: home, projects, articles, lessons, 3D library with preview, and calendar | Done |
| Makers sign up, sign in and have a personal account page | Done |
| Makers earn points, level up, gain skills and appear in a ranking | Done |
| The home page shows featured missions, the lab's level and the top 5 makers | Done |
| Each lab has a storage limit (20 GB), so one lab cannot fill the server | Done, in final review |

While building the storage limit, the team also found and fixed two security flaws in how
labs are kept apart. Both fixes are already in place.

## Must happen before launch

These two are not optional: without either one, no real user can use the site.

| What | Why it is needed | Who | Effort |
|---|---|---|---|
| Put the site online | Today the site runs only on developers' computers. This sets up the server, the secure web address, daily backups and alerts. | Developers | Medium |
| Terms of use and privacy policy text | Brazilian privacy law (LGPD) requires people to accept them before signing up. The checkbox is built; the words are missing. | UNESP legal team | No development; depends on legal review time |

## Your decisions

Pick MVP or Nice to have in the last column of each row. Start with missions: it is the
biggest open question.

Effort is an estimate, compared with what is already built. Small is about the size of the
new home page; Large is about the size of accounts and sign-up.

| Item | What it means | Effort | Our suggestion | Decision |
|---|---|---|---|---|
| Makers finish missions on the site | Makers can see missions but cannot send the proof photo; only staff can, through the admin panel. If this is left out, we hide missions until it is ready. | Medium (hiding missions: Small) | MVP, if missions are part of the launch message | To decide |
| Custom pixel-art avatars | The avatar builder is ready, but no artist has drawn the pieces yet. Until then, every maker shows the same placeholder. | Artist's work, then Small to Medium | Nice to have, but hire the artist now | To decide |
| Each lab with its own name, logo and colours | Only matters when a second lab joins. Today every page shows Fab Lab CITe. | Medium | Nice to have | To decide |
| Guided setup to add a new lab | Today the team adds a lab by hand in the admin panel, which works for a few labs. | Medium | Nice to have | To decide |
| Separate file storage per lab | Needed to delete all of one lab's files if it leaves, which privacy law can require. Only matters with a second lab. | Medium | Nice to have, but done before a second lab signs | To decide |
| Clickable maker profiles | Clicking a maker in the ranking would open their public page. Today names are not clickable. | Medium | Nice to have (already agreed) | Nice to have |

## Next steps

1. **Ask UNESP legal for the terms and privacy text, now.** It takes the longest and needs
   no developer.
2. **Fill in the Decision column above**, starting with missions.
3. **Developers put the site online**, in parallel with the decisions.
4. **Developers build what you marked MVP**, then the site launches.
