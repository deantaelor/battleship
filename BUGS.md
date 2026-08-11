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
