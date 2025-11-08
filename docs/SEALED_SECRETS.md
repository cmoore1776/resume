# Using Sealed Secrets

This guide shows how to use Bitnami Sealed Secrets to securely store the OpenAI API key in Git.

## Why Sealed Secrets?

- **GitOps-friendly**: Encrypted secrets can be safely committed to Git
- **Cluster-specific**: Secrets can only be decrypted by your cluster
- **Automatic decryption**: Sealed Secrets Controller automatically creates regular Kubernetes Secrets

## Prerequisites

1. **Sealed Secrets Controller** installed in your cluster
2. **kubeseal** CLI tool installed locally

### Install kubeseal CLI

**macOS:**
```bash
brew install kubeseal
```

**Linux:**
```bash
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-0.24.0-linux-amd64.tar.gz
tar xfz kubeseal-0.24.0-linux-amd64.tar.gz
sudo install -m 755 kubeseal /usr/local/bin/kubeseal
```

### Get your cluster's public key

```bash
# Fetch the public key from your cluster
kubeseal --fetch-cert --controller-namespace=sealed-secrets > pub-cert.pem
```

Store `pub-cert.pem` securely - you'll need it to encrypt secrets.

## Creating a Sealed Secret for OpenAI API Key

### Method 1: Using kubeseal --raw (Recommended)

```bash
# Encrypt your API key directly
echo -n 'sk-your-actual-openai-api-key-here' | \
  kubeseal --raw \
    --from-file=/dev/stdin \
    --namespace=resume \
    --name=resume-secrets \
    --scope=strict \
    --cert=pub-cert.pem

# Output will be a base64 encrypted string:
# AgA...long-encrypted-string...==
```

### Method 2: Using a temporary secret file

```bash
# Step 1: Create a regular Kubernetes secret (not applied to cluster)
kubectl create secret generic resume-secrets \
  --from-literal=openai-api-key=sk-your-actual-key-here \
  --dry-run=client \
  -o yaml > /tmp/secret.yaml

# Step 2: Seal the secret
kubeseal --format=yaml \
  --cert=pub-cert.pem \
  < /tmp/secret.yaml \
  > chart/templates/sealedsecret.yaml

# Step 3: Delete the unencrypted file!
rm /tmp/secret.yaml
```

### Method 3: Edit the example template

1. Copy the example:
   ```bash
   cp chart/templates/sealedsecret.yaml.example chart/templates/sealedsecret.yaml
   ```

2. Encrypt your key using Method 1 above

3. Replace the encrypted data in `chart/templates/sealedsecret.yaml`:
   ```yaml
   spec:
     encryptedData:
       openai-api-key: AgA...your-encrypted-string...==
   ```

## Enable SealedSecret in Helm Chart

Edit `chart/values.yaml`:

```yaml
secrets:
  useSealed: true  # Enable SealedSecret template
  existingSecret: resume-secrets
```

## Deploy

Once you have the SealedSecret:

```bash
# Commit the sealed secret to Git
git add chart/templates/sealedsecret.yaml
git commit -m "Add sealed secret for OpenAI API key"
git push

# ArgoCD will automatically sync and create the secret
argocd app sync resume
```

## Verify the Secret

After deployment:

```bash
# Check that the SealedSecret was created
kubectl get sealedsecret -n resume

# Check that the regular Secret was created by the controller
kubectl get secret resume-secrets -n resume

# View the secret (base64 encoded)
kubectl get secret resume-secrets -n resume -o yaml
```

## Updating the API Key

To rotate the API key:

```bash
# 1. Encrypt the new key
echo -n 'sk-new-api-key-here' | \
  kubeseal --raw \
    --from-file=/dev/stdin \
    --namespace=resume \
    --name=resume-secrets \
    --scope=strict \
    --cert=pub-cert.pem

# 2. Update chart/templates/sealedsecret.yaml with new encrypted value

# 3. Commit and push
git add chart/templates/sealedsecret.yaml
git commit -m "Rotate OpenAI API key"
git push

# 4. ArgoCD will sync and update the secret
# 5. Restart the backend pod to use the new secret
kubectl rollout restart deployment/resume-backend -n resume
```

## Troubleshooting

### Secret not decrypting

```bash
# Check Sealed Secrets Controller logs
kubectl logs -n sealed-secrets -l name=sealed-secrets-controller

# Common issues:
# - Wrong namespace in SealedSecret
# - Wrong secret name
# - Public key doesn't match cluster
```

### Re-encrypt for different cluster

If you need to deploy to a different cluster:

```bash
# Fetch the new cluster's public key
kubeseal --fetch-cert --controller-namespace=sealed-secrets > new-cluster-cert.pem

# Re-encrypt with the new cert
echo -n 'sk-your-key' | \
  kubeseal --raw \
    --from-file=/dev/stdin \
    --namespace=resume \
    --name=resume-secrets \
    --cert=new-cluster-cert.pem
```

## Security Best Practices

1. **Never commit unencrypted secrets** to Git
2. **Store pub-cert.pem securely** - needed for disaster recovery
3. **Rotate keys periodically** - use the update process above
4. **Use strict scope** - prevents secret from being used in wrong namespace/name
5. **Backup the sealed-secrets controller key** - stored in `sealed-secrets-key` secret in `sealed-secrets` namespace

## Backup/Recovery

To backup your encryption key (for disaster recovery):

```bash
# Export the sealed-secrets encryption key
kubectl get secret -n sealed-secrets sealed-secrets-key -o yaml > sealed-secrets-key-backup.yaml

# Store this file SECURELY (encrypted backup, password manager, etc.)
# This key can decrypt ALL your sealed secrets!
```

To restore on a new cluster:

```bash
# Apply the backed-up key BEFORE installing sealed-secrets
kubectl create namespace sealed-secrets
kubectl apply -f sealed-secrets-key-backup.yaml

# Then install sealed-secrets controller
# Your existing SealedSecrets will work immediately
```
