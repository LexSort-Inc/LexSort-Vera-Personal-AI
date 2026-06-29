# VERA Scripts — Build & Sign Utilities

| Script | Description |
|---|---|
| `build-module.sh` | Build, sign, and ZIP a VERA Pro module. Usage: `./scripts/build-module.sh <module-name> [--sign]` |
| `sign-module.js` | Ed25519 sign a module's `bundle.js` and `manifest.json`. Produces `signature.sig`. |
| `sign-manifest.js` | Sign `website/modules/index.json` with Ed25519. Produces `index.json.sig`. |
| `generate-test-keys.js` | Generate Ed25519 test key pairs for local development. |
| `setup-stripe-resources.js` | Create Stripe products, prices, and webhook endpoint. |
| `install-hooks.sh` | Install git hooks (symlinks `scripts/hooks/` to `.git/hooks/`). |
| `hooks/pre-commit` | Pre-commit hook: runs contract tests (skips gracefully if test target missing). |
| `simulate-clean-env.sh` | Simulate a clean install environment for testing the first-run experience. |
