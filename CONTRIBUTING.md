# Contributing to cursor-peformance

Thank you for your interest in contributing! This project follows standard open-source practices.

## How to Contribute

### Reporting Bugs

1. Search existing issues first
2. Open a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment (OS, Node version, Cursor version)
   - If security-related: see `SECURITY.md` — do NOT open public issues for security vulnerabilities

### Suggesting Features

1. Open a discussion first to gauge interest
2. Describe the use case and why it would benefit the community
3. Outline any security implications

### Pull Requests

#### Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes following the code standards below
4. Add tests for new functionality
5. Run the test suite: `npm test`
6. Run security tests: `npm run test:security`
7. Commit using conventional commits: `git commit -m "feat: add new capability axis"`
8. Push and open a PR

#### Code Standards

- **TypeScript**: Strict mode, no `any`, use `unknown` instead
- **Security**: All changes must pass security audit patterns
  - Use `InputValidator` for all inputs
  - Use HMAC-signed tokens for auth
  - Seal singletons with `Object.freeze`
  - Use async locks for race conditions
  - Log critical operations to audit log
- **Testing**: All public methods need tests
- **Documentation**: Update SKILL.md files and `SECURITY_AUDIT.md` for security changes

#### Security Requirements

Before submitting a PR that touches security-critical paths:

- Run `npm run test:security`
- Verify audit log chain integrity
- Ensure rate limiting is applied
- Check for unbounded memory growth
- Document any new security considerations in `SECURITY_AUDIT.md`

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/cursor-peformance.git
cd cursor-peformance/autonomous-agent

# Install dependencies
npm install

# Run tests
npm test

# Run security tests
npm run test:security

# Build plugin
npm run plugin:publish

# Run all plugin tests
npm run plugin:test
```

### Project Structure

```
autonomous-agent/
├── capability-router/      # Routing engine + dispute tournament
├── evolution/              # Elo system, slot evolution, audit log (hardened)
├── computer-control/       # Keyboard/mouse/screen control
├── skill-manager/          # Skill discovery + auto-install
├── task-planner/           # Project decomposition
├── executor/               # Task execution
├── verification/           # Self-verification (LATS + committee + RAG)
├── memory-store/           # Cross-session persistence
├── codegraph/              # Codebase analysis + LRU cache
├── error-recovery/         # Self-learning error patterns
├── agent-orchestration/    # Multi-agent team coordination
├── security/               # SessionGuard, InputValidator, RateLimiter
├── .cursor/
│   ├── rules/              # Cursor rules (always-apply)
│   ├── agents/             # Cursor agent definitions
│   ├── skills/             # Bundled community skills
│   └── hooks/              # Cursor hook definitions
├── scripts/                # Plugin build + publish scripts
└── tests/                  # Test suite
```

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `security`

Examples:
- `feat(capability-router): add new analyze_code axis`
- `fix(hardened-audit-log): resolve file lock contention`
- `security(elo-system): add K-factor bounds validation`
- `docs(readme): add architecture diagram`

## Code of Conduct

By participating, you agree to uphold our community standards. See `CODE_OF_CONDUCT.md`.

## Questions?

Open a GitHub Discussion or open an issue with the `question` label.