# bumpkg

## Project Overview

`bumpkg` is a TypeScript-based CLI tool for upgrading project dependencies. It scans dependency declarations, checks for available updates, and writes the new version ranges back to manifest files after confirmation.

Core capabilities:

- Supports `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`
- Works with both single-package projects and monorepos
- Supports `package.json`, `package.yaml`, and `package.yml`
- Supports `npm`, `pnpm`, `yarn`, and `bun` project environments
- Supports catalog-based dependency configuration
- Includes only `minor` and `patch` updates by default, and enables `major` upgrades with `--major`
- Cleans up common lock files after updates so dependencies can be reinstalled cleanly

## How to Use

Run the CLI in the current project:

```bash
npx bumpkg
```

Include major version upgrades:

```bash
npx bumpkg --major
```

You can also specify a target working directory:

```bash
npx bumpkg --cwd ./packages/app
```

Typical workflow:

1. Resolve the current project or workspace configuration
2. Collect supported dependency declarations
3. Display the list of available updates
4. Write updated version ranges back after confirmation
5. Remove common lock files such as `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, and `bun.lockb`

## License and Author

This project is released under the [MIT](./LICENSE) License.

Author: [`lonewolfyx`](https://github.com/lonewolfyx)
