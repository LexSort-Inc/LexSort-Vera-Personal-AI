# VERA — Developer Handoff Index

**Project:** LexSort VERA — Local-First Private AI Desktop App  
**Parent Brand:** LexSort Inc.  
**Current Versions:** VERA Freeware v1.1.6 · VERA Pro v1.0.5  
**Stack:** React 19 (TypeScript) + Rust (Tauri v2) + Ollama  
**Launch Date:** July 1, 2026  

---

## 📚 Documentation Map

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, repo structure, mermaid diagram |
| [SECURITY.md](docs/SECURITY.md) | Tauri sandbox, capability whitelisting, Ed25519 license gate |
| [BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md) | Dev commands, CI/CD pipeline, versioning checklist |
| [UPDATE_SYSTEM.md](docs/UPDATE_SYSTEM.md) | Custom update flow: discovery → download → install |
| [AI_ENGINE.md](docs/AI_ENGINE.md) | Ollama onboarding, model selection, SHA hashes |
| [MARKETING_AND_ROADMAP.md](docs/MARKETING_AND_ROADMAP.md) | Marketing tasks, module roadmap, community strategy |
| [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) | Hour-by-hour launch day checklist |
| [TESTER_SETUP.md](TESTER_SETUP.md) | Beta tester onboarding guide |
| [CONTRACTS.md](CONTRACTS.md) | IPC contract definitions |
| [KEY_MANIFEST.md](KEY_MANIFEST.md) | Cryptographic key reference |

---

## ⚡ Quick Reference

### Run in dev mode
```bash
cd lexsort-personal-ai && npm run tauri dev
```

### Release a new version
```bash
# 1. Bump version in: tauri.conf.json, package.json, Cargo.toml (both repos)
# 2. Commit & push, then tag:
git tag v1.1.6 && git push origin v1.1.6
```

### Deploy the website to lexsort.com
> ⚠️ Netlify is NOT connected to GitHub auto-deploy.
> Every change to `website/` must be manually deployed.

```bash
# From repo root (uses netlify.toml: publish = "website")
netlify deploy --prod
# If 'netlify' is not in PATH, install it first:
npm install -g netlify-cli
```

**Site ID:** `charming-zuccutto-05cf6a` (lexsort.com)  
**Fallback:** Drag the `website/` folder to:  
https://app.netlify.com/projects/charming-zuccutto-05cf6a/deploys


---

## 🏗 Repo Structure (Top Level)

```
Lexsort-personal-ai/          # Freeware repo
├── lexsort-personal-ai/      # Tauri app (React + Rust)
├── website/                  # Static marketing pages + API
├── netlify/                  # Serverless functions (Stripe, uptime)
├── discord-bot/              # License bot + slash commands
└── docs/                     # This doc set

Lexsort-Vera-Pro/             # Pro repo (private)
├── lexsort-vera-pro/         # Tauri app (React + Rust)
└── .github/workflows/        # CI/CD release pipeline
```

---

*VERA is a LexSort Inc. project. All rights reserved.*
