# Unattended checks for the SortMyCover build (NH-06 default: run from a Makefile on the n8n host, not GitHub Actions).
# Every target is offline except `lighthouse` (npx lighthouse needs network once). Any failing command fails the make run.
# Docs: automation/local/LOCAL-STAGING.md, section "Unattended checks".

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
.PHONY: help test eval check lighthouse readiness a11y landing-build

NODE ?= node
LANDING_DIST := landing/dist
LANDING_SKIP := assets fonts shared

help: ## List the targets
	@echo "make test        full offline suite (workflows, billing, optimisation, media, generators, scripts, landing e2e + axe, templates, tasks.json)"
	@echo "make eval        LLM eval gate in dry-run (golden set, state machine, prefilter); must print PASS"
	@echo "make check       test + eval (the CI gate)"
	@echo "make a11y        axe-core WCAG 2.1 A/AA on every landing angle (start, details, booking, not-a-fit, thanks) + holding privacy page"
	@echo "make lighthouse  landing/lighthouse.sh over every built angle (needs network for npx lighthouse)"
	@echo "make readiness   node scripts/readiness.mjs (if present)"

landing-build:
	$(NODE) landing/build.mjs >/dev/null

test: landing-build
	@echo "== workflows + billing + optimisation"
	$(NODE) --test automation/tests/*.test.mjs automation/billing/*.test.js optimisation/workflows.test.js
	@echo "== media (W23)"
	cd automation/media && $(NODE) --test media.test.js w23-auth.test.js
	@echo "== generators"
	$(NODE) --test automation/tests/generators.test.mjs
	@echo "== scripts"
	@if ls scripts/*.test.mjs >/dev/null 2>&1; then $(NODE) --test scripts/*.test.mjs; else echo "no scripts/*.test.mjs"; fi
	@echo "== landing e2e (Playwright)"
	$(NODE) --test landing/tests/quiz.spec.ts
	@echo "== landing a11y (axe-core)"
	$(NODE) landing/tests/a11y.mjs
	@echo "== WhatsApp templates"
	$(NODE) automation/templates/check.mjs
	@echo "== build/tasks.json"
	$(NODE) build/validate-tasks.mjs
	@echo "TEST PASS"

a11y: landing-build
	$(NODE) landing/tests/a11y.mjs

eval:
	@out=$$($(NODE) evals/run.mjs --dry-run 2>&1) || { echo "$$out"; echo "EVAL FAIL (non-zero exit)"; exit 1; }; \
	 echo "$$out" | tail -n 12; \
	 echo "$$out" | grep -qx 'PASS' || { echo "EVAL FAIL (no PASS line)"; exit 1; }

check: test eval
	@echo "CHECK PASS"

lighthouse: landing-build
	@fail=0; n=0; \
	 for d in $(LANDING_DIST)/*/; do \
	   slug=$$(basename "$$d"); \
	   case " $(LANDING_SKIP) " in *" $$slug "*) continue;; esac; \
	   [ -f "$$d/index.html" ] || continue; \
	   n=$$((n+1)); echo "== lighthouse $$slug"; \
	   landing/lighthouse.sh "$$slug" || { echo "FAIL $$slug"; fail=1; }; \
	 done; \
	 [ $$n -gt 0 ] || { echo "no angle pages in $(LANDING_DIST)"; exit 1; }; \
	 [ $$fail -eq 0 ] && echo "LIGHTHOUSE PASS ($$n pages)" || { echo "LIGHTHOUSE FAIL"; exit 1; }

readiness:
	@if [ -f scripts/readiness.mjs ]; then $(NODE) scripts/readiness.mjs; else echo "scripts/readiness.mjs not present yet (owned by the readiness task); nothing to run"; fi
