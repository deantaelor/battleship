# Bugs & Fixes Log

Keep a running list of issues we hit while building, plus how we fixed them.

## 1. GitHub repo creation blocked by token
- **Symptom**: `gh repo create deantaelor/battleship` failed with `GraphQL: Resource not accessible by integration (createRepository)`.
- **Fix**: Asked the user to create the public repo manually and paste the URL, then linked the local project to it.
- **Date**: 2026-08-10

