# Daily workplace practice

`dailyBank.ts` contains authored briefs, single deliverables, private evaluation criteria and, where appropriate, exact answer keys. The first three entries in each base bank are easy, the next four intermediate and the last three challenging. `EXTRA` adds one alternate concept per tier. A candidate/day seed chooses one unused concept for each slot; the route persists the resulting set so refreshing does not change it.

Graphic design, video editing, UI/UX, Excel and SQL use separate banks. Other skills currently use the closest occupational bank, or the general workplace bank if no match is known. Add a dedicated bank and explicit routing when a skill needs different work samples; don’t just insert the skill name into someone else’s scenario.

## Publication checklist

- Use a globally unique concept ID for a meaningful ability. If the only change is wording or numbers, it is not a new concept.
- Give one realistic brief and ask for one deliverable. Context is not a list of extra exercises.
- Easy tasks should be quick and direct; intermediate tasks should require application; challenging tasks should involve trade-offs, judgement or a stronger work sample.
- Include enough concrete details to distinguish a good response from generic advice. Criteria should point back to those details and explain why the proposed work would succeed.
- Use a checkable answer only when exact matching is appropriate. Open-ended outputs unlock self-review criteria, count toward completion and do not earn leaderboard points. They are not scored or verified for originality.
- Run `npx tsx --test server/src/tasks/practice.test.ts`. Automated checks catch duplicate IDs and prompts and verify tier selection; they do not replace an editorial check of relevance, difficulty or conceptual overlap.

Existing published sets and earned points are retained. The new banks are used when a new set is generated.
