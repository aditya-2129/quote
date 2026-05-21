# 004 - Keep Quote Handoff On Safe Body Dimensions

**Type:** AFK  
**Status:** blocked by 002, 003

## What to build

Make CAD-to-quote handoff consume the corrected body-dimension contract. Moving CAD into a quotation must not use a detected feature diameter as the quote part's stock/body diameter.

The completed slice should be demoable by importing the transfer-tool fixture, moving it to a quotation, and seeing quote parts with safe dimensions.

## Acceptance criteria

- [ ] Complex bodies create quote parts from envelope dimensions, not incidental feature diameters.
- [ ] True round-stock bodies can still create quote parts with diameter/length defaults.
- [ ] True hex-stock bodies can still create quote parts with AF/length defaults.
- [ ] Transfer-tool quote handoff is covered by a focused test or browser-verifiable acceptance path.
- [ ] No quote part silently receives the misleading current transfer-tool diameter values as stock diameter.

## Blocked by

- 002 - Stop Complex Bodies From Showing Stock Diameter
- 003 - Preserve True Cylinder And Hex Stock Dimensions
