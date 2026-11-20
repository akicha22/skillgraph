# SkillGraph design brief
## Feel
Confident, warm, trustworthy. Proof of work, not a school exam. Clean and calm, with small moments of energy (points, streaks, verified evidence).
## Users
Candidates come first: 360px phones, thumbs, slow 4G. Recruiters: laptops, scanning a lot of evidence quickly.
## Colour (tokens in src/index.css, Tailwind v4 @theme)
- brand-50..950: references to the existing indigo scale (var(--color-indigo-N)). Primary actions, links, active nav. Nothing repaints when this is added.
- accent-50..950: references to the amber scale. Points, streaks, rank and highlights only. Never for errors.
- success = emerald (verified, correct, done). warning = amber. danger = rose. info = sky.
- Neutrals stay slate. Page background slate-50, cards white. Body text slate-900, secondary slate-600; text that matters is never lighter than slate-500.
- WCAG AA: 4.5:1 for body text, 3:1 for large text and UI borders. Never rely on colour alone: pair status colours with an icon and a word.
## Type
- Font: Inter (400, 500, 600, 700, display=swap). Fallback stack: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Kannada", "Noto Sans Devanagari", "Noto Sans Tamil", sans-serif.
- Scale: display 36/44 (30 on mobile), h1 28, h2 20, h3 16 semibold, body 15-16, inputs 16 minimum (stops iOS zoom), small 13-14, caption 12.
- Body line-height at least 1.6 (Indic scripts need room). Headings tracking-tight. Scores, ranks and table numbers use tabular-nums.
- No fixed-width text containers. Every label must survive 40% longer translated text.
## Shape, depth, motion
- Radius: controls 10px, cards 16px, pills full. Borders 1px slate-200. Shadows are soft and layered, as three tokens: card, raised, overlay.
- Interactive cards lift 1px with a slightly stronger shadow on hover. Every interactive element has a visible 2px brand focus ring with 2px offset.
- Motion: 150-200ms ease-out only. Page content fades in (opacity plus a 4px rise). Skeletons shimmer. Respect prefers-reduced-motion by disabling all of it. No animation library.
## Layout
- Mobile first, designed at 360px, then md and lg. Page container max-w-6xl, padding 16px on mobile and 24px on desktop. 4px grid; sections 24-32px apart.
- Tap targets at least 44px. Candidate navigation on phones is a bottom tab bar with icons and labels; from md up it is the top nav.
- Tables become stacked cards below md. Wide content scrolls inside its own container, never the page.
## Components (src/components/ui)
Button (primary, secondary, ghost, danger; sm, md, lg; loading state with spinner; optional leading icon) plus a buttonClasses() helper so a Link can look like a button. Card (plain and interactive). Badge (neutral, brand, success, warning, danger, accent). Alert (info, success, warning, error, with icon; role="alert" for errors). StatTile. Field (label, hint, error, required marker, aria-describedby wired), Input, Textarea, Select, all 44px high. Spinner, Skeleton, EmptyState (icon, title, text, optional action), ProgressBar (with accessible label).
## Page patterns
- Every page: PageHeader (title, one-line description, optional actions), then content in Cards.
- Every list or data view has three designed states: loading (skeleton), empty (EmptyState with a next action), error (Alert, with a retry if one exists).
- Charts (recharts): brand and accent colours, rounded bars, light gridlines, styled tooltip, a text alternative below the chart.
- Recruiter evidence views: scores show a ProgressBar plus the number. Signals that are not proof (activity, paste) use a neutral Alert and the words "signal, not proof".
## Content honesty
Template output is labelled as template output, never "AI-generated". Empty states beat placeholder numbers.
## Done checklist for any page
Works at 360px with no sideways page scroll. Usable by keyboard with visible focus. Every input has a label. Loading, empty and error states exist. No repeated indigo-/slate- button or card recipes left (use the ui components). Build and lint pass.
