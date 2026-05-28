-include node_modules/@move-elevator/makefile-tools/Makefile.internal

.PHONY: build
## Build the pwa container
build:
	docker compose up -d --build frontend

.PHONY: up
## Start the pwa container
up:
	docker compose up -d frontend

.PHONY: start
## Alias for make up
start: up

.PHONY: stop
## Stop the running pwa container
stop:
	docker compose stop

.PHONY: ci
## Execute npm ci in a temp container
ci:
	docker compose run --rm frontend npm ci

.PHONY: shell
## Get Access to the pwa container
shell:
	docker compose exec frontend sh

.PHONY: dev
## Start the dev server inside
dev: up
	docker compose exec frontend npm run dev -- --host 0.0.0.0

.PHONY: lint
## Execute npm run lint
lint:
	docker compose exec frontend npm run lint

.PHONY: lint-fix
## Execute npm run lint:fix
lint-fix:
	docker compose exec frontend npm run lint:fix

.PHONY: test
## Run all test for the pwa
test:
	@printf "\n\033[1;35m=== Type Check ===\033[0m\n"
	@docker compose exec frontend npm run typecheck
	@printf "\n\033[1;36m=== Unit Tests ===\033[0m\n"
	@docker compose run --rm frontend npm test
	@printf "\n\033[1;33m=== Lint ===\033[0m\n"
	@docker compose exec frontend npm run lint
	@printf "\n\033[1;32m=== TODO Check ===\033[0m\n"
	@$(MAKE) todo

.PHONY: test-coverage
## Run unit tests with a coverage report (html output in coverage/)
test-coverage:
	docker compose run --rm frontend npm run test:coverage


.PHONY: frontend-build
## Execute a pwa build
frontend-build:
	docker compose exec frontend npm run build

.PHONY: demo-build
## Execute a demo pwa build
demo-build:
	docker compose exec frontend npm run build:demo

.PHONY: preview
## Run the preview server to browse the build
preview: frontend-build
	docker compose up -d frontend
	docker compose exec frontend npm run preview -- --host 0.0.0.0

%::
	@true
