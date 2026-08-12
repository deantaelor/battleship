# Bugs & Fixes Log

Keep a running list of issues we hit while building, plus how we fixed them.

## 1. GitHub repo creation blocked by token
- **Symptom**: `gh repo create deantaelor/battleship` failed with `GraphQL: Resource not accessible by integration (createRepository)`.
- **Fix**: Asked the user to create the public repo manually and paste the URL, then linked the local project to it.
- **File**: `N/A`
- **Date**: 2026-08-10

## 2. First URL attempt landed on Google reCAPTCHA
- **Symptom**: Typing `http://localhost:8080` into the browser's address/search bar was interpreted as a Google search, triggering a captcha page instead of loading the local server.
- **Fix**: Selected the browser's address bar with `Ctrl+A`, typed the URL directly, and pressed Enter to navigate instead of search.
- **File**: `N/A`
- **Date**: 2026-08-10

## 3. Heatmap overlay hid player ship cells
- **Symptom**: When the AI heatmap was rendered with an opaque background color on every cell, the player's own ships disappeared behind the heat color.
- **Fix**: Changed the heatmap to a semi-transparent `::after` pseudo-element overlay so the ship, hit, miss, and sunk colors remain visible underneath.
- **File**: `style.css`
- **Date**: 2026-08-10

## 4. AI log punctuation was awkward
- **Symptom**: Log lines read as "Enemy fires at X — miss. (highest probability cell (score 23))" with an extra period and nested parentheses.
- **Fix**: Reformatted the reason string so logs read "Enemy fires at X — miss, highest probability cell (score 23)."
- **File**: `app.js`
- **Date**: 2026-08-10

## 5. No API key for the LLM gunner
- **Symptom**: Delegated mode was planned to use an LLM to parse plain-language orders, but no OpenAI/Anthropic API key was available.
- **Fix**: Built a rule-based “gunner” agent in the browser that parses keywords like carrier, top-right, around A5, finish off, etc. and explains its choice. The rule parser can be swapped for an LLM call later by replacing `gunnerPick()`.
- **File**: `app.js`
- **Date**: 2026-08-10

## 6. After-action report over-counted hunt length
- **Symptom**: The report reported a ship hunt taking e.g. 49 shots from first hit to sink, but the total game only had 47 enemy turns.
- **Fix**: Changed the report to measure hunt length by the index of the ship's first and final enemy shots in the enemy-only history, so it counts only enemy turns spent on that ship.
- **File**: `app.js`
- **Date**: 2026-08-10

## 7. “Wasted shots” count was inflated for random/hunt AI
- **Symptom**: The report treated every enemy miss in random or hunt mode as wasted because the heat value was hard-coded to 0.
- **Fix**: Made `chooseEnemyShot()` compute the probability heat for all difficulties and store the chosen cell’s heat value with each shot, so misses on plausible cells are not counted as wasted.
- **File**: `app.js`
- **Date**: 2026-08-10

## 8. Styling changes did not appear after reload
- **Symptom**: After adding the mute button and new CSS, the browser served the cached `style.css`, so the button rendered at the wrong position.
- **Fix**: Hard-refreshed the browser (`Ctrl+Shift+R`) to bypass the cache; considered adding a query-string cache-buster but kept it simple.
- **File**: `style.css`
- **Date**: 2026-08-11

## 9. Async fire sequence allowed overlapping shots
- **Symptom**: Converting `fireAtEnemy()` to `async` for the cinematic sink meant rapid clicks or the autonomous loop could start a new shot while the previous sequence was still running.
- **Fix**: Added a `state.processing` flag that blocks new player-side shots until the current turn fully resolves.
- **File**: `app.js`
- **Date**: 2026-08-11

## 10. Replay after-action report showed 0 enemy ships sunk after a player win
- **Symptom**: `saveReplay()` used `snapshotShips()` for the saved ship state, which reset `hits: 0` and `sunk: false` on every ship, so the win report counted `Enemy ships sunk: 0/5`.
- **Fix**: Added `deepCloneShips()` that preserves hits, sunk flags, and `sunkAt` values, and used it only for the end-of-game replay snapshot. Kept `snapshotShips()` for replay setup so the replay boards start empty.
- **File**: `app.js`
- **Date**: 2026-08-11

## 11. Replay log used "fires" for the player
- **Symptom**: Replay log messages read "You fires at A4 — hit." because the shooter/verb template always used `fires`.
- **Fix**: Added `const verb = shooter === 'You' ? 'fire' : 'fires';` in `applyReplayShot()` so the log reads "You fire at A4" and "Enemy/Gunner fires at A4".
- **File**: `app.js`
- **Date**: 2026-08-11

## 12. Devin ship-sink line had an extra "the"
- **Symptom**: When the player sunk a themed ship, Devin's bubble read "and that's the The Vercelerator, gone" because ship themes already include "The".
- **Fix**: Removed the extra "the" from the `playerSink` line templates so the message reads "and that's The Vercelerator, gone".
- **File**: `app.js`
- **Date**: 2026-08-11

## 13. Replay card scrolled itself while typewriter log entries played
- **Symptom**: As each replay log entry was typed out, `li.scrollIntoView()` scrolled the nearest ancestor, causing the whole `.replay-card` to scroll down and hide the title/status.
- **Fix**: Made the replay log list scrollable (`overflow-y: auto`) and updated `logTypewriter()` to reset `listEl.scrollTop = 0` for scrollable lists instead of calling `scrollIntoView()`. Also reset `replay-card` and `replay-overlay` scroll positions when `startReplay()` runs.
- **File**: `style.css`, `app.js`
- **Date**: 2026-08-11

## 14. Replay overlay card was vertically centered and cut off the top
- **Symptom**: The replay card centered itself in the viewport and the title/status were pushed above the visible area.
- **Fix**: Changed `.replay-overlay` from `align-items: center` to `align-items: flex-start` with extra top padding, and set `.replay-card` to `max-height: calc(100vh - 4rem)` with `overflow-y: auto`. Reduced replay board cell size with `.replay-boards { --cell-size: 24px; }` so the card fits better on small screens.
- **File**: `style.css`
- **Date**: 2026-08-11

## 15. Shareable replay URL replayed as a win before the game was over
- **Symptom**: Opening a replay URL with too few moves showed the after-action report as "You won in X turns" while also reporting 0 enemy ships sunk.
- **Fix**: `loadReplayFromUrl()` now infers the winner from the simulated board state (`allSunk(...)`) instead of defaulting to `Player`, and `shareReplay()` only becomes available from completed games. Added `simulateGame()` to reconstruct a full replay from a deterministic seed and move list.
- **File**: `app.js`
- **Date**: 2026-08-10

## 16. `navigator.clipboard.writeText()` could hang and leave no user feedback
- **Symptom**: The "Share replay" button sometimes produced no visible response because `navigator.clipboard.writeText()` never resolved or failed silently.
- **Fix**: Wrapped the clipboard write in a `Promise.race` with a 1.5s timeout, then fall back to `document.execCommand('copy')` and a `window.prompt()` with the URL as a last resort.
- **File**: `app.js`
- **Date**: 2026-08-10

## 17. AI evaluation had no UI and required a backend to compare algorithms
- **Symptom**: There was no way to demonstrate that the probability-density AI outperforms random fire.
- **Fix**: Added an in-browser AI Evaluation Lab that runs the three enemy AIs against cloned random fleets, averages shots to sink, accuracy, and wasted shots, and renders a results table.
- **File**: `index.html`, `style.css`, `app.js`
- **Date**: 2026-08-10
