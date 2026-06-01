# ── Skeet Build & Test Automation ──────────────────────────────────────────

.PHONY: help install test test-coverage bench backtest verify-offline check-readiness start stop e2e lhci security-scan

help:
	@echo "Skeet PvP Trading Agent Commands:"
	@echo "  make install         Install all dependencies"
	@echo "  make test            Run all unit tests"
	@echo "  make test-coverage   Run tests and output coverage reports"
	@echo "  make bench           Run latency benchmark script"
	@echo "  make backtest        Replay historical games and check performance"
	@echo "  make verify-offline  Run offline execution and exit safety checks"
	@echo "  make check-readiness Verify repository readiness before submission"
	@echo "  make start           Start the agent daemon"
	@echo "  make e2e             Run Playwright E2E tests for dashboard"
	@echo "  make lhci            Run Lighthouse CI audits"
	@echo "  make security-scan   Perform security scan and dependency audits"

install:
	npm install

test:
	npm test

test-coverage:
	npm run test:coverage

bench:
	npm run bench

backtest:
	npm run backtest

verify-offline:
	npm run verify-offline

check-readiness:
	npm run check-readiness

start:
	npm start

e2e:
	@echo "🎭 Running Playwright E2E tests (demo mode)..."
	npx playwright test

lhci:
	@echo "🔦 Running Lighthouse CI audit..."
	npx lhci autorun

security-scan:
	@echo "=== NPM AUDIT ==="
	npm audit --audit-level=high || true
	@echo ""
	@echo "=== LICENSE CHECK ==="
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true
