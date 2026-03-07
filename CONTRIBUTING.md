# Contributing

## Repository structure

This is an npm workspaces monorepo. Each n8n node lives in its own package
under `packages/` and can be published and installed independently.

```
packages/
  n8n-nodes-nostr/        # Nostr NIP-59 Gift Wrap DM node
    credentials/           # n8n credential types
    nodes/Nostr/           # node implementation + tests
    package.json           # independent npm package
    tsconfig.json
  n8n-nodes-opencrow/     # OpenCrow trigger pipe node
    nodes/OpenCrow/        # node implementation + tests
    package.json
    tsconfig.json
test/
  helpers.ts              # shared test infrastructure
tsconfig.base.json        # shared TypeScript config
jest.config.js            # root Jest config (runs all tests)
flake.nix                 # Nix build for each package
```

## Prerequisites

- [Node.js](https://nodejs.org/) (22+)
- [Nix](https://nixos.org/) (optional, for reproducible builds and formatting)

With Nix, run `nix develop` to get a shell with all dependencies.

## Setup

```bash
npm install --legacy-peer-deps
```

## Running tests

```bash
# run all tests
npm test

# run tests for a specific node
npx jest --testPathPattern=Nostr
npx jest --testPathPattern=OpenCrow

# watch mode
npx jest --watch
```

Tests exercise the n8n nodes end-to-end by mocking `IExecuteFunctions` (see
`test/helpers.ts`) and verifying that nodes produce the correct output.

The Nostr tests use [mock-socket](https://github.com/thoov/mock-socket) to
spin up an in-memory WebSocket relay — no network access needed. The OpenCrow
tests create a temporary FIFO to verify messages are written correctly.

## Building

```bash
# build all packages
npm run build

# build a specific package
npm run build --workspace=packages/n8n-nodes-nostr

# build with Nix (reproducible, for deployment)
nix build .#n8n-nodes-nostr
nix build .#n8n-nodes-opencrow
```

## Type checking

```bash
# check the entire repo (includes tests)
npx tsc --noEmit
```

The root `tsconfig.json` covers all packages and test files. Each workspace has
its own `tsconfig.json` (extending `tsconfig.base.json`) that excludes test
files — the workspace `tsc` build only compiles production code.

## Formatting

```bash
# with Nix (nixfmt + prettier)
nix fmt

# prettier only
npx prettier --write packages test
```

## Adding a new node

1. Create `packages/n8n-nodes-yournode/` with:
   - `package.json` — set `name`, `n8n.nodes`, `n8n.credentials` (if any), and
     any runtime `dependencies`
   - `tsconfig.json` — extend `../../tsconfig.base.json`, exclude `**/*.test.ts`
   - `nodes/YourNode/YourNode.node.ts`
   - `nodes/YourNode/test/YourNode.node.test.ts`

2. Register it in `flake.nix` by adding an entry to `packages` and `checks`.

3. Run `npm install --legacy-peer-deps` to set up the workspace.

4. Write tests first (TDD), then implement the node.

## CI

- **Dependabot** updates npm and GitHub Actions dependencies weekly.
- **Auto-merge** merges dependency PRs automatically after CI passes.
- Nix builds consume `package-lock.json` directly via `importNpmLock` — no
  hash files to maintain.
