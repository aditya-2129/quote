# Design System Notes

## Product Feel

This is a shop-floor-adjacent quoting workstation: precise, calm, compact, and fast to scan. It should feel like an engineering document and production dashboard, not a marketing site.

## Visual Language

- Background: warm paper-like app surface.
- Panels: white or near-white with subtle borders.
- Accent: restrained industrial blue for active states and primary actions.
- Status colors: green for success, amber for warnings, red for danger, blue for info.
- Corners: small radii. Existing tokens keep most controls between 3px and 10px.
- Shadows: minimal; use borders and spacing first.
- Typography: sans for labels/content, mono for IDs, quantities, rates, minutes, dimensions, and money.

## Layout Principles

- Prioritize dense information hierarchy over roomy editorial sections.
- Keep the parts table dominant in the quote workspace.
- Keep CAD and preview canvases visually quiet so geometry remains the focus.
- Use fixed-height toolbars and stable grid tracks for operational controls.
- Avoid nested cards. Major areas are panels; repeated records can be rows/cards only when useful.
- Ensure every button and field has enough space for realistic manufacturing labels, file names, and Indian currency formatting.

## Interaction Patterns

- Use icon buttons for toolbar actions and obvious compact controls.
- Use icon plus text for primary commands such as Save, Export PDF, Send, Add part, and Move to Quotation.
- Use segmented controls for mutually exclusive modes.
- Use tabs for compact subviews like Inputs/History/Notes.
- Use checkboxes/toggles for binary include/exclude and visibility state.
- Use selects for catalogs such as material and machine.
- Use numeric inputs for dimensions, rates, quantities, margins, taxes, setup minutes, and cycle minutes.

## CAD Viewer Rules

- The 3D scene should be direct and unframed inside the main canvas/panel.
- Viewer controls should not obscure geometry more than necessary.
- Any change to camera, selection, edge display, measurement, or explode behavior should be tested with multiple files from `public/test_files/`.
- Do not alter the protected explode algorithm without explicit user approval.

## Quote Workspace Rules

- Keep user-facing language on quote rows as "part" rather than "mesh".
- Keep selected part state synchronized between table and preview.
- Preserve `perAssembly` behavior when duplicate bodies are grouped.
- Keep cost and lead-time calculations live and visibly tied to editable inputs.
- DFM actions should make risk state explicit: unresolved, accepted, or fixed.

## CSS Source Of Truth

Design tokens live in `src/styles/index.css` under `:root` and `[data-theme="dark"]`.

Before introducing new colors, radii, shadows, or font sizes, check whether a token or existing class already matches the need.
