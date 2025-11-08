.PHONY: help dev-backend dev-frontend dev build-backend build-frontend build docker-build docker-push deploy clean

# Configuration
REGISTRY ?= registry.k3s.local.christianmoore.me:8443
NAMESPACE ?= resume
BACKEND_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/backend
FRONTEND_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/frontend
TAG ?= latest

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development
dev-backend: ## Run backend in development mode
	cd backend && go run main.go

dev-frontend: ## Run frontend in development mode
	cd frontend && npm run dev

dev: ## Run both backend and frontend (requires tmux or run in separate terminals)
	@echo "Run 'make dev-backend' in one terminal and 'make dev-frontend' in another"

# Building
build-backend: ## Build backend binary
	cd backend && CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o bin/main .

build-frontend: ## Build frontend for production
	cd frontend && npm run build

build: build-backend build-frontend ## Build both backend and frontend

# Docker
docker-build: ## Build Docker images for both services
	@echo "Building backend: $(BACKEND_IMAGE):$(TAG)"
	docker build -t $(BACKEND_IMAGE):$(TAG) backend/
	@echo "Building frontend: $(FRONTEND_IMAGE):$(TAG)"
	docker build -t $(FRONTEND_IMAGE):$(TAG) frontend/

docker-push: ## Push Docker images to local registry
	@echo "Pushing to local registry: $(REGISTRY)"
	docker push $(BACKEND_IMAGE):$(TAG)
	docker push $(FRONTEND_IMAGE):$(TAG)

docker-build-push: docker-build docker-push ## Build and push Docker images

docker-tag-version: ## Tag images with version (usage: make docker-tag-version TAG=v1.0.0)
	docker tag $(BACKEND_IMAGE):latest $(BACKEND_IMAGE):$(TAG)
	docker tag $(FRONTEND_IMAGE):latest $(FRONTEND_IMAGE):$(TAG)
	docker push $(BACKEND_IMAGE):$(TAG)
	docker push $(FRONTEND_IMAGE):$(TAG)

# ArgoCD
argocd-deploy: ## Deploy ArgoCD application
	kubectl apply -f argocd/resume.yaml

argocd-sync: ## Sync ArgoCD application
	argocd app sync resume

argocd-status: ## Check ArgoCD application status
	argocd app get resume

argocd-diff: ## Show diff between current state and Git
	argocd app diff resume

# Helm
helm-template: ## Render Helm templates
	helm template resume chart/ -n $(NAMESPACE)

helm-install: ## Install Helm chart
	helm install resume chart/ -n $(NAMESPACE) --create-namespace

helm-upgrade: ## Upgrade Helm chart
	helm upgrade resume chart/ -n $(NAMESPACE)

helm-uninstall: ## Uninstall Helm chart
	helm uninstall resume -n $(NAMESPACE)

# Kubernetes
k8s-status: ## Check Kubernetes deployment status
	kubectl get all -n $(NAMESPACE)

k8s-logs-backend: ## Tail backend logs
	kubectl logs -n $(NAMESPACE) -l app.kubernetes.io/component=backend -f

k8s-logs-frontend: ## Tail frontend logs
	kubectl logs -n $(NAMESPACE) -l app.kubernetes.io/component=frontend -f

k8s-describe-backend: ## Describe backend deployment
	kubectl describe deployment -n $(NAMESPACE) -l app.kubernetes.io/component=backend

k8s-describe-frontend: ## Describe frontend deployment
	kubectl describe deployment -n $(NAMESPACE) -l app.kubernetes.io/component=frontend

k8s-restart-backend: ## Restart backend deployment
	kubectl rollout restart deployment -n $(NAMESPACE) -l app.kubernetes.io/component=backend

k8s-restart-frontend: ## Restart frontend deployment
	kubectl rollout restart deployment -n $(NAMESPACE) -l app.kubernetes.io/component=frontend

# Secrets
secret-create: ## Create secret manually (requires OPENAI_API_KEY env var)
	kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	kubectl create secret generic resume-secrets \
		--from-literal=openai-api-key=$(OPENAI_API_KEY) \
		-n $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -

secret-delete: ## Delete secret
	kubectl delete secret resume-secrets -n $(NAMESPACE)

# Cleanup
clean: ## Clean build artifacts
	rm -rf backend/bin
	rm -rf frontend/dist

# Setup
setup-backend: ## Install backend dependencies
	cd backend && go mod download

setup-frontend: ## Install frontend dependencies
	cd frontend && npm install

setup: setup-backend setup-frontend ## Install all dependencies

# Testing
test-backend: ## Run backend tests
	cd backend && go test ./...

test-frontend: ## Run frontend tests
	cd frontend && npm test

lint-backend: ## Lint backend code
	cd backend && go fmt ./...
	cd backend && go vet ./...

lint-frontend: ## Lint frontend code
	cd frontend && npm run lint

lint: lint-backend lint-frontend ## Lint all code

# Quick deploy workflow
deploy: docker-build-push argocd-sync ## Build, push, and sync (full deploy)

deploy-version: ## Deploy with version tag (usage: make deploy-version TAG=v1.0.0)
	$(MAKE) docker-build TAG=$(TAG)
	$(MAKE) docker-push TAG=$(TAG)
	@echo "Update chart/values.yaml with tag: $(TAG)"
	@echo "Then run: make argocd-sync"

# Development workflow
dev-deploy: ## Quick dev deployment (build, push, restart pods)
	$(MAKE) docker-build-push
	$(MAKE) k8s-restart-backend
	$(MAKE) k8s-restart-frontend
	@echo "Waiting for pods to restart..."
	kubectl rollout status deployment -n $(NAMESPACE) -l app.kubernetes.io/component=backend
	kubectl rollout status deployment -n $(NAMESPACE) -l app.kubernetes.io/component=frontend
