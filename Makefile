.PHONY: help test test-backend test-frontend test-all test-watch-backend test-watch-frontend \
	lint lint-backend lint-frontend \
	dev dev-backend dev-frontend \
	build build-backend build-frontend \
	docker-build docker-push docker-build-push docker-tag-version \
	setup setup-backend setup-frontend \
	deploy deploy-version dev-deploy \
	argocd-deploy argocd-sync argocd-status argocd-diff \
	helm-template helm-install helm-upgrade helm-uninstall \
	k8s-status k8s-logs-backend k8s-logs-frontend k8s-describe-backend k8s-describe-frontend \
	k8s-restart-backend k8s-restart-frontend \
	secret-create secret-delete \
	clean

# Configuration
REGISTRY ?= registry.k3s.local.christianmoore.me:8443
NAMESPACE ?= resume
BACKEND_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/backend
FRONTEND_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/frontend
TAG ?= latest

# ============================================================================
# Help
# ============================================================================

help: ## Show this help message with grouped targets
	@echo 'Usage: make [target]'
	@echo ''
	@echo '============================================================================'
	@echo 'Testing & Quality'
	@echo '============================================================================'
	@grep -E '^(test|lint).*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo '============================================================================'
	@echo 'Development'
	@echo '============================================================================'
	@grep -E '^(dev|setup).*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo '============================================================================'
	@echo 'Building'
	@echo '============================================================================'
	@grep -E '^build.*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo '============================================================================'
	@echo 'Docker'
	@echo '============================================================================'
	@grep -E '^docker.*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo '============================================================================'
	@echo 'Deployment'
	@echo '============================================================================'
	@grep -E '^(deploy|argocd|helm).*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo '============================================================================'
	@echo 'Kubernetes Operations'
	@echo '============================================================================'
	@grep -E '^(k8s|secret).*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo '============================================================================'
	@echo 'Cleanup'
	@echo '============================================================================'
	@grep -E '^clean.*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'

# ============================================================================
# Testing & Quality
# ============================================================================

test: lint test-backend test-frontend ## Run linting and all tests (comprehensive)
	@echo ""
	@echo "✓ All tests passed!"

test-backend: ## Run backend unit tests
	@echo "Running backend tests..."
	cd backend && go test -v ./...

test-frontend: ## Run frontend unit tests
	@echo "Running frontend tests..."
	cd frontend && npm test

test-only: test-backend test-frontend ## Run only tests without linting

test-watch-backend: ## Run backend tests in watch mode
	cd backend && go test -v ./... -watch

test-watch-frontend: ## Run frontend tests in watch mode
	cd frontend && npm run test:watch

lint: lint-backend lint-frontend ## Lint all code (backend + frontend)
	@echo ""
	@echo "✓ All linting passed!"

lint-backend: ## Lint backend code (go fmt + go vet)
	@echo "Linting backend..."
	cd backend && go fmt ./...
	cd backend && go vet ./...

lint-frontend: ## Lint frontend code (eslint)
	@echo "Linting frontend..."
	cd frontend && npm run lint

# ============================================================================
# Development
# ============================================================================

dev-backend: ## Run backend in development mode
	cd backend && go run main.go

dev-frontend: ## Run frontend in development mode
	cd frontend && npm run dev

dev: ## Run both backend and frontend (requires separate terminals)
	@echo "Run 'make dev-backend' in one terminal and 'make dev-frontend' in another"

setup: setup-backend setup-frontend ## Install all dependencies (backend + frontend)

setup-backend: ## Install backend dependencies
	cd backend && go mod download

setup-frontend: ## Install frontend dependencies
	cd frontend && npm install

# ============================================================================
# Building
# ============================================================================
build-backend: ## Build backend binary
	cd backend && CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o bin/main .

build-frontend: ## Build frontend for production
	cd frontend && npm run build

build: build-backend build-frontend ## Build both backend and frontend

# ============================================================================
# Docker
# ============================================================================
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

# ============================================================================
# Deployment
# ============================================================================

deploy: docker-build-push argocd-sync ## Full deploy: build, push, and sync

deploy-version: ## Deploy with version tag (usage: make deploy-version TAG=v1.0.0)
	$(MAKE) docker-build TAG=$(TAG)
	$(MAKE) docker-push TAG=$(TAG)
	@echo "Update chart/values.yaml with tag: $(TAG)"
	@echo "Then run: make argocd-sync"

dev-deploy: ## Quick dev deployment (build, push, restart pods)
	$(MAKE) docker-build-push
	$(MAKE) k8s-restart-backend
	$(MAKE) k8s-restart-frontend
	@echo "Waiting for pods to restart..."
	kubectl rollout status deployment -n $(NAMESPACE) -l app.kubernetes.io/component=backend
	kubectl rollout status deployment -n $(NAMESPACE) -l app.kubernetes.io/component=frontend

# ArgoCD
argocd-deploy: ## Deploy ArgoCD application
	kubectl apply -f argocd/resume.yaml

argocd-sync: ## Sync ArgoCD application
	argocd app sync resume

argocd-status: ## Check ArgoCD application status
	argocd app get resume

argocd-diff: ## Show diff between current state and Git
	argocd app diff resume

# Helm (alternative to ArgoCD)
helm-template: ## Render Helm templates
	helm template resume chart/ -n $(NAMESPACE)

helm-install: ## Install Helm chart
	helm install resume chart/ -n $(NAMESPACE) --create-namespace

helm-upgrade: ## Upgrade Helm chart
	helm upgrade resume chart/ -n $(NAMESPACE)

helm-uninstall: ## Uninstall Helm chart
	helm uninstall resume -n $(NAMESPACE)

# ============================================================================
# Kubernetes Operations
# ============================================================================
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

# Kubernetes Secrets
secret-create: ## Create secret manually (requires OPENAI_API_KEY env var)
	kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	kubectl create secret generic resume-secrets \
		--from-literal=openai-api-key=$(OPENAI_API_KEY) \
		-n $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -

secret-delete: ## Delete secret
	kubectl delete secret resume-secrets -n $(NAMESPACE)

# ============================================================================
# Cleanup
# ============================================================================
clean: ## Clean build artifacts
	rm -rf backend/bin
	rm -rf frontend/dist
