# Local developer commands for the MioLog PWA.

.PHONY: build
build:
	docker compose up -d --build frontend

.PHONY: up
up:
	docker compose up -d frontend

.PHONY: start
start: up

.PHONY: stop
stop:
	docker compose stop

.PHONY: ci
ci:
	docker compose run --rm frontend npm ci

.PHONY: shell
shell:
	docker compose exec frontend sh

.PHONY: dev
dev: up
	docker compose exec frontend npm run dev -- --host 0.0.0.0

.PHONY: lint
lint:
	docker compose exec frontend npm run lint

.PHONY: lint-fix
lint-fix:
	docker compose exec frontend npm run lint:fix

.PHONY: test
test:
	@printf "\n\033[1;35m=== Type Check ===\033[0m\n"
	@docker compose exec frontend npm run typecheck
	@printf "\n\033[1;36m=== Unit Tests ===\033[0m\n"
	@docker compose run --rm frontend npm test
	@printf "\n\033[1;33m=== Lint ===\033[0m\n"
	@docker compose exec frontend npm run lint

.PHONY: frontend-build
frontend-build:
	docker compose exec frontend npm run build

.PHONY: demo-build
demo-build:
	docker compose exec frontend npm run build:demo

.PHONY: preview
preview: frontend-build
	docker compose up -d frontend
	docker compose exec frontend npm run preview -- --host 0.0.0.0
