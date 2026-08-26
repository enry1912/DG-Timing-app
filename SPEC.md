# Disc Golf Timing — Product Spec

## Architecture

The app is dependency-free and uses browser ES modules: `app.js` coordinates the interface; `js/profileStore.js` owns profile validation, local persistence, and timing helpers; `js/audioEngine.js` owns Web Audio; and `js/csv.js` formats exports. Keep new domain rules in focused modules and leave `app.js` for UI coordination. Player text is rendered through DOM APIs, never HTML injection.

## Purpose

Mobile-friendly trainer for reproducing disc-golf backhand run-up timing with speech cues, step beeps, and optional video reference.

## Current capabilities

- Built-in and locally created player profiles with four timing intervals: R→L, L→R, R→X, X→Plant.
- Workout playback, pure-rhythm test, repetitions/rest settings, and spoken player/repetition cues.
- Per-player editor with local video upload, approximate frame stepping at 24/30/60 FPS, and start/end recording for each step. Playback uses distinct sustained step sounds and supports overlap.
- R1 and L are optional; R2, X-step, and Plant are required. Comparison lines align on R2.
- Profiles can optionally include shot type, a concise description, and a tournament/source link.
- Anthony Barela is the bundled default profile, explicitly linked to a local reference video in `videos/`.
- No player is selected on initial load; workout video restarts per repetition and pauses during rest intervals.
- Workout opens its video dialog immediately; a colored step-range bar follows the active video step and closes automatically when the set ends.
- A one-time 1.1-second audio-settle delay precedes the spoken player cue; video-backed step sounds schedule against current video time.
- Compact player list; users select profiles for a shared-scale comparison dashboard that shows all five footfall points.
- Forest-green disc-golf UI with light green controls; use local system fonts only (no third-party font requests).
- Players can be dragged into the comparison dashboard; Enter starts a selected workout and Escape stops it.
- Drag-and-drop and a directional add/remove control manage comparison-board membership.
- Profiles and comparison choices persist locally; videos stay only in the active browser session.

## Data and privacy

- No server, account, analytics, or remote upload exists yet.
- Future authentication/database work must define ownership, shared reference clips, retention/deletion, and an updated privacy notice.

## Maintenance rule

Update this file whenever a user-visible feature, data-storage behavior, or timing workflow changes.

## Local development

Run `node local-server.js` and open `http://localhost:8080`; do not use `file:///` for video/PWA testing.
