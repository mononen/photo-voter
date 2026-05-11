COMPOSE = docker compose

.PHONY: dev build down logs tidy npm-install

dev:
	$(COMPOSE) up --build

build:
	$(COMPOSE) build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

# Run go mod tidy inside a temp container, writing go.mod/go.sum back to host.
# Use this to commit a reproducible go.sum without installing Go locally.
tidy:
	docker run --rm \
		-v $(PWD)/backend:/app \
		-w /app \
		golang:1.25-alpine \
		go mod tidy

# Run npm install inside a temp container, writing package-lock.json back to host.
npm-install:
	docker run --rm \
		-v $(PWD)/frontend:/app \
		-w /app \
		node:22-alpine \
		npm install
