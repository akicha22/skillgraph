# Daily workplace practice

`typedBank.ts` is the published bank. A skill's exact catalog slug selects its bank. Skills without a bank are skipped; a profile with none gets a clear empty state instead of a question from another skill. `dailyBank.ts` contains the earlier occupational material for reference; it is not a runtime fallback.

Every new set has ten distinct formats in order: spot the issue, make a choice, correct a mistake, write a line, put in order, make a prediction, suggest an idea, judge an example, set a priority, and explain a trade-off. Slots 1–3 are easy, 4–7 intermediate, and 8–10 challenging. Later work should require better judgment, not a longer submission. Each prompt has one deliverable and can be answered in the text box without software or uploads. Selected slots use authored alternatives on alternating dates; the route persists published sets.

## Publication checklist

- Match the catalog skill explicitly. Don't relabel an occupational prompt for a skill it doesn't test.
- Use a globally unique concept ID for a meaningful ability. Changing the numbers or wording is not a new concept.
- Give one concrete brief and ask for one short deliverable matching the slot's format.
- Use an exact answer only where the expected wording is unambiguous. Open-ended submissions unlock self-review criteria, count toward completion, and do not earn leaderboard points.
- Run `npx tsx --test server/src/tasks/practice.test.ts`. Automated checks verify unique concepts and prompts, slot format, skill routing, and progression. Review relevance and difficulty editorially as well.

SQL, Civil Engineering, and Video Editing prompts use short practical operations, workplace application, and critique or trade-off decisions. Calculations belong only where they are part of the work (for example, slab quantity and a bending check). SQL snippets and editing plans are typed; the platform does not execute queries or require media uploads.

Current-day unanswered legacy prompts are refreshed from the selected skill banks. Attempted and completed rows, notes, and earned points are retained. Unmatched, unanswered legacy prompts are not served. Increment the persisted bank revision in `candidateTasks.ts` when a future migration needs to refresh already-generated prompts.
