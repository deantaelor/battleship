# Bugs & Fixes Log

Keep a running list of issues we hit while building, plus how we fixed them.

## 1. GitHub repo creation blocked by token
- **Symptom**: `gh repo create deantaelor/battleship` failed with `GraphQL: Resource not accessible by integration (createRepository)`.
- **Fix**: Asked the user to create the public repo manually and paste the URL, then linked the local project to it.
- **Date**: 2026-08-10

## 2. First URL attempt landed on Google reCAPTCHA
- **Symptom**: Typing `http://localhost:8080` into the browser's address/search bar was interpreted as a Google search, triggering a captcha page instead of loading the local server.
- **Fix**: Selected the browser's address bar with `Ctrl+A`, typed the URL directly, and pressed Enter to navigate instead of search.
- **Date**: 2026-08-10

## 3. Heatmap overlay hid player ship cells
- **Symptom**: When the AI heatmap was rendered with an opaque background color on every cell, the player's own ships disappeared behind the heat color.
- **Fix**: Changed the heatmap to a semi-transparent `::after` pseudo-element overlay so the ship, hit, miss, and sunk colors remain visible underneath.
- **Date**: 2026-08-10

## 4. AI log punctuation was awkward
- **Symptom**: Log lines read as "Enemy fires at X — miss. (highest probability cell (score 23))" with an extra period and nested parentheses.
- **Fix**: Reformatted the reason string so logs read "Enemy fires at X — miss, highest probability cell (score 23)."
- **Date**: 2026-08-10

## 5. No API key for the LLM gunner
- **Symptom**: Delegated mode was planned to use an LLM to parse plain-language orders, but no OpenAI/Anthropic API key was available.
- **Fix**: Built a rule-based “gunner” agent in the browser that parses keywords like carrier, top-right, around A5, finish off, etc. and explains its choice. The rule parser can be swapped for an LLM call later by replacing `gunnerPick()`.
- **Date**: 2026-08-10

