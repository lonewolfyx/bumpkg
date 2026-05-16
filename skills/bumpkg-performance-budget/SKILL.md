---
name: bumpkg-performance-budget
description: Use when working on bumpkg dependency-check performance, version cache, registry probing, or latency regressions. Trigger for requests about 200ms cached runs, 5s cold runs, version.json behavior, fast registry selection, and "must meet hard performance requirements".
---

# Bumpkg Performance Budget

Apply this skill when changing the CLI dependency detection flow in this repository.

## Hard requirements

These are release gates, not goals:

1. If dependency package data already exists in `node_modules/.bumpkg/version.json` and is still fresh, running the CLI must finish in `<= 200ms`.
2. If cache is missing or expired, running the CLI must finish in `<= 5s`.

Any change that violates either rule is not complete.

## Required implementation rules

- Fresh cache CLI path must not perform registry probing.
- Fresh cache CLI path must not perform package metadata network requests.
- Fresh cache CLI path must reuse local `version.json` directly.
- Registry selection must be lazy. Only do it when a network fetch is actually needed.
- Do not move expensive work into `resolveConfig` or other always-run setup steps.
- Prefer reading one local cache file over introducing extra cache files.
- When cache is missing or expired, do network work in parallel and keep timeouts tight.

## Review checklist

Before considering the work done, verify all of the following:

- `resolveConfig` does not force a network path for cached CLI runs.
- Cached CLI runs can complete from local files only.
- First-run or expired-cache CLI flow chooses an available fast registry only when needed.
- `version.json` continues to be the source of truth for package metadata cache.
- No new code path reintroduces unconditional probing, fallback loops, or duplicate requests.

## Validation expectations

- Add or update tests that prove cached CLI runs do not call the network.
- Add or update tests that prove cold or expired CLI runs can still probe and fetch correctly.
- Measure the end-to-end CLI path when possible. Do not treat an internal helper benchmark as sufficient evidence.
- If you cannot measure real wall-clock time in the current environment, say so explicitly and leave the code in a state that minimizes hot-path I/O and network work.

## Preferred change areas

When fixing regressions for this skill, inspect these files first:

- `src/config.ts`
- `src/npm.ts`
- `src/registry.ts`
- `src/check.ts`
- `test/npm/`
- `test/config/`
