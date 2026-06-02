# ── Skeet Build & Test Automation ──────────────────────────────────────────

.PHONY: help install test test-coverage ci bench backtest verify-offline check-readiness start start-dashboard stop e2e lhci security-scan

help:
	@echo "Skeet PvP Trading Agent Commands:"
	@echo "  make install         Install all dependencies (daemon + dashboard)"
	@echo "  make test            Run all unit tests (daemon + dashboard)"
	@echo "  make test-coverage   Run tests and output coverage reports (daemon + dashboard)"
	@echo "  make ci              Run full CI checks (format, typecheck, test coverage for all)"
	@echo "  make bench           Run latency benchmark script"
	@echo "  make backtest        Replay historical games and check performance"
	@echo "  make verify-offline  Run offline execution and exit safety checks"
	@echo "  make check-readiness Verify repository readiness before submission"
	@echo "  make start           Start the agent daemon"
	@echo "  make start-dashboard Start the Next.js dashboard development server"
	@echo "  make e2e             Run Playwright E2E tests for dashboard"
	@echo "  make lhci            Run Lighthouse CI audits"
	@echo "  make security-scan   Perform security scan and dependency audits"

install:
	npm install
	npm install --prefix dashboard

test:
	npm test
	npm run test --prefix dashboard

ci:
	npm run ci

test-coverage:
	npm run test:coverage
	npm run test:coverage --prefix dashboard

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

start-dashboard:
	npm run dev --prefix dashboard

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
