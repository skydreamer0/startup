COMPOSE ?= docker compose

.PHONY: dev prod migrate logs down

dev:
	$(COMPOSE) up -d postgres
	cd backend && npm run dev

prod:
	$(COMPOSE) up -d --build

migrate:
	$(COMPOSE) run --rm backend npx prisma migrate deploy

logs:
	$(COMPOSE) logs -f

down:
	$(COMPOSE) down
