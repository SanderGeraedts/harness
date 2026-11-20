# Lessons

One line each time a task needed rework: the tester sent it back, CI failed twice, or a
human corrected something (G-0014). Newest last. The architect turns a lesson that repeats
into a proposed rule change for the harness.

`- YYYY-MM-DD T-NNNN <role>: what went wrong, and what would have prevented it`

- 2026-11-20 T-0003 tester: the list screen was wider than the phone as soon as a note was long, though the review said it was checked on a phone-sized screen; an end-to-end test at 320px with a long title and note, comparing the page's width with the screen's, would have caught it.
