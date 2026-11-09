---
name: frontend-design
description: Design principles for building or restyling any user-facing page, component, or CSS in this project. Use before writing or changing HTML, CSS, or UI copy in public/, or when asked to make something look better, redesign it, or "make it look less AI-generated".
---

# Frontend design

Left alone, a model picks the most common choice at every step, and the result looks like thousands of other generated sites. Banning one default doesn't fix that. The model just moves to the next most common one: no Inter becomes Space Grotesk, and no purple gradient becomes cream, serif and terracotta. Good results come from making each decision on purpose, for a reason that comes from the content.

## 1. Decide before you code

Before writing any markup, write a short design note (in your head or in the reply). It should say:

- **What the page is for and who reads it.** A notes app for one person is a reading and writing tool, not a landing page.
- **A direction in a few concrete words.** For example: "quiet paper notebook, ink-dark text, one warm accent". Avoid empty words like "modern", "clean" or "sleek".
- **Tokens:** the background, text, muted and accent colors, the type scale and the spacing unit. Put them in CSS variables on `:root`, with a dark-mode set.

If the project already has tokens (this one does, in `public/app.css`), work inside them. Only change them when you mean to change the look.

## 2. Typography

- Pick fonts that suit the direction, and use them throughout. One family used with intent beats three that compete.
- Make hierarchy obvious through size and weight. Headings should be clearly bigger than body text, not 1.1× bigger. Avoid near-identical weights like 400 against 500.
- Set body text for reading: a line length of 60–75 characters, line height of about 1.5, and enough contrast (WCAG AA at minimum).
- Don't reach for Inter, Roboto, Poppins, Montserrat, Space Grotesk or Playfair Display just because they're popular. If one fits the direction, fine. Otherwise the system stack is usually better than a trendy webfont.

## 3. Color

- Use one dominant neutral, one accent, and semantic colors (danger, success) only where they mean something. Use the accent sparingly so it keeps signaling something.
- Avoid purple or indigo gradients, gradient text, neon glows on dark backgrounds, and the stock Tailwind palette used as-is.
- Check that both light and dark modes have enough contrast. Don't just invert the colors.

## 4. Layout and components

- Let the content decide the layout. Avoid the template sequence of centered hero, three icon cards, testimonials and CTA band unless the page really needs those parts.
- Not everything needs a card. Separate things with whitespace, alignment and hairline rules before adding boxes. Never put cards inside cards.
- Use a consistent spacing scale (multiples of one base unit), and keep alignment tidy along a few shared edges.
- Make border radius, shadow and border weight consistent across the whole UI. Pick one each.
- Avoid a thick colored stripe on one side of a rounded box. Use a hairline border all around, or no border.

## 5. Effects and motion

- The default should be less. Avoid glassmorphism, blurred blobs, particle backgrounds, drop shadows on everything, and hover animations on every element.
- Motion should explain something, such as where a panel came from or that a save worked. Keep it short (150–250 ms) and respect `prefers-reduced-motion`.

## 6. Icons and imagery

- Don't use emoji or ✨ as feature icons. Use one consistent SVG icon set, or text alone.
- Only use an icon if it helps someone scan the page. A heading usually doesn't need one.

## 7. Copy

UI text is part of the design.

- Say what the thing does in plain words. Use short labels with verbs on buttons ("Save note", not "Submit").
- Cut these: seamless, unlock, empower, leverage, robust, elevate, supercharge, "AI-powered X for modern Y", and exclamation marks in UI text.
- Empty states and errors should tell the reader what happened and what to do next.

## 8. Accessibility (not optional)

- Use semantic HTML (`button`, `nav`, `main`, `label`), give every interactive element a visible focus style, and keep tap targets at least 40px.
- Never use color alone to carry meaning.
- Make sure it works at 320px wide with no horizontal scroll.

## 9. Review before you finish

Look at the result. If Playwright is available, take a screenshot at desktop and phone widths, in both light and dark mode. Then check:

- [ ] Could this page belong to a thousand other products? If so, what in it is specific to this one?
- [ ] Did I add anything (a gradient, shadow, card, icon or animation) without a reason I could state?
- [ ] Is the hierarchy clear at a glance? Squint at the page. What stands out first?
- [ ] Do contrast, focus states and the 320px layout all hold up?
- [ ] Is every color, size and space a token rather than a one-off value?
- [ ] Does the copy avoid the banned words above?

If a check fails, fix it before reporting the work as done.

## This project's constraints

- The CSP in `public/_headers` allows styles and fonts only from `'self'`. Any webfont must be self-hosted under `public/`. Google Fonts and inline `style=""` attributes will be blocked.
- Render user-written note content only through the existing sanitization helpers.
- The UI is a personal notes tool, so optimize for reading and writing comfort over marketing polish.
- Run `bun run typecheck` before publishing changes.
