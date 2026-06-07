# hl-evm-core-playground — task runner
#
#   contracts/  Foundry (forge) — L1Read / CoreWriter interfaces + demo caller
#   scripts/    viem demos — demo:l1read (read), demo:corewriter (encode/send)
#   frontend/   React + Vite + Tailwind v4, single Cloudflare Worker

.DEFAULT_GOAL := help

CONTRACTS_DIR := contracts
SCRIPTS_DIR   := scripts
FRONTEND_DIR  := frontend

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: install-contracts install-scripts install-frontend ## Install all deps

.PHONY: install-contracts
install-contracts: ## forge install forge-std
	cd $(CONTRACTS_DIR) && forge install foundry-rs/forge-std

.PHONY: install-scripts
install-scripts: ## npm install (scripts)
	cd $(SCRIPTS_DIR) && npm install

.PHONY: install-frontend
install-frontend: ## npm install (frontend)
	cd $(FRONTEND_DIR) && npm install

.PHONY: build
build: build-contracts build-frontend ## Build contracts + frontend

.PHONY: build-contracts
build-contracts: ## forge build
	cd $(CONTRACTS_DIR) && forge build

.PHONY: build-frontend
build-frontend: ## Build the frontend SPA + Worker
	cd $(FRONTEND_DIR) && npm run build

.PHONY: test
test: ## forge test (unit)
	cd $(CONTRACTS_DIR) && forge test -vv

.PHONY: test-fork
test-fork: ## forge fork tests (NOTE: HL precompiles don't run on Foundry forks — use demo-l1read)
	cd $(CONTRACTS_DIR) && forge test --match-contract L1ReadFork --fork-url hl_testnet -vvv

.PHONY: demo-l1read
demo-l1read: ## Run the read-only L1Read demo against testnet
	cd $(SCRIPTS_DIR) && npm run demo:l1read

.PHONY: demo-corewriter
demo-corewriter: ## Encode (and optionally send) CoreWriter actions
	cd $(SCRIPTS_DIR) && npm run demo:corewriter

.PHONY: typecheck
typecheck: ## Typecheck scripts + frontend
	cd $(SCRIPTS_DIR) && npm run typecheck
	cd $(FRONTEND_DIR) && npx tsc -b

.PHONY: dev
dev: ## Start the frontend dev server (Vite + Worker)
	cd $(FRONTEND_DIR) && npm run dev

.PHONY: deploy
deploy: ## Build + deploy the frontend Worker (wrangler)
	cd $(FRONTEND_DIR) && npm run deploy

.PHONY: clean
clean: ## Remove build artifacts
	cd $(CONTRACTS_DIR) && forge clean || true
	rm -rf $(FRONTEND_DIR)/dist $(FRONTEND_DIR)/.wrangler
