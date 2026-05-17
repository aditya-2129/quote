# US-006: Export And List Integration

## Story
As a quoting user, I want saved quote data to appear across quote lists, RFQs, analytics, and export so that the app behaves as one workflow.

## Scope
- Make quote/RFQ/analytics/list views consume saved quote state.
- Make export consume persisted quote data and cost snapshot.

## Acceptance Criteria
- Saved quote appears in `/quotes`.
- Saved RFQ/project appears in `/rfqs`.
- Analytics counts saved RFQs and quotes.
- Export uses persisted quote title, customer/project metadata, parts, and totals.

## Notes
- Full send workflow and revision polish can follow after persistence is stable.
