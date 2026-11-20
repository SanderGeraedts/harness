# Lessons

One line each time a task needed rework: the tester sent it back, CI failed twice, or a
human corrected something (G-0014). Newest last. The architect turns a lesson that repeats
into a proposed rule change for the harness.

`- YYYY-MM-DD T-NNNN <role>: what went wrong, and what would have prevented it`

- 2026-11-20 T-0003 tester: the list screen was wider than the phone as soon as a note was long, though the review said it was checked on a phone-sized screen; an end-to-end test at 320px with a long title and note, comparing the page's width with the screen's, would have caught it.
- 2026-11-20 T-0008 ux-designer: the sync line opens its details but the design gave it nothing that shows so, and it was built that way; a design that makes something pressable must say what tells a user it can be pressed.
