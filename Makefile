COMPOSE = docker compose
REGISTRY = adoah
TAG      ?= latest

.PHONY: dev build down logs tidy npm-install publish

dev:
	$(COMPOSE) up --build

build:
	$(COMPOSE) build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

publish:
	docker build --platform linux/amd64 -t $(REGISTRY)/photo-voter-backend:$(TAG) ./backend
	docker build --platform linux/amd64 --target production \
		--build-arg VITE_API_URL= \
		-t $(REGISTRY)/photo-voter-frontend:$(TAG) \
		./frontend
	docker push $(REGISTRY)/photo-voter-backend:$(TAG)
	docker push $(REGISTRY)/photo-voter-frontend:$(TAG)

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
