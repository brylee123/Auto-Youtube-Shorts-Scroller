# Picture-in-picture validation

## Automated regression checks

Run `node tests/content.test.cjs` with Node.js 18 or later.
The tests execute the shipped content script with simulated DOM, media events,
PiP requests, and timers. They cover navigation, repeat counts, stale events,
video replacement, cancellation, and rejected PiP transfers. They do not prove
compatibility with the live YouTube player or Chrome's native PiP window.

The TypeScript source and shipped JavaScript are both updated. This repository
does not yet have a dependency manifest for its existing TypeScript build.

## Live Chrome checklist (required before merging)

1. Load the branch's `extension` directory through Chrome's Extensions page
   with Developer mode enabled. Reload any open YouTube tabs.
2. Enable auto-scrolling, open Shorts, and confirm ordinary playback advances.
3. Right-click the video twice and select **Picture in picture**.
4. Switch to another tab, then another application. Watch at least five Shorts
   finish; check that both the selected Short and the PiP image advance.
5. Repeat with scrolling up, two plays per Short, and a nonzero additional delay.
6. Open comments with scrolling on comments disabled. Confirm navigation waits
   until comments close. Enable scrolling on comments and verify it advances.
7. Turn auto-scrolling off during a delay and while comments are open. Confirm
   no pending navigation happens; turning it on again must resume.
8. Navigate manually during a pending delay. Confirm the previous Short cannot
   trigger a delayed extra navigation.
9. Close PiP manually. Confirm it stays closed and normal auto-scrolling works.
10. Check Shorts that YouTube loads by replacing the video element. Record
    whether Chrome transfers PiP or requires opening it again.
11. Leave Shorts for a normal video and confirm no Shorts navigation occurs.

Record Chrome version, OS, failures, and any console messages beginning with
`[Auto Youtube Shorts Scroller]`.

## Known limitation

Native PiP belongs to one video element. If YouTube removes that element before
the replacement is ready, Chrome may close the window. Reopening or transferring
PiP may require a user gesture. This change attempts a transfer only when PiP is
still open and never silently reopens a closed window. Uninterrupted PiP across
every YouTube player variant remains unverified.
