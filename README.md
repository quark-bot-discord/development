# Quark Development Environment

This repository contains tools and configurations for easily setting up a development environment for Quark services.

## Usage

```bash
# Show help
quark

# Setup development environment (interactive)
quark setup

# Add local services (interactive)
quark add

# Remove local services (interactive)
quark remove

# Non-interactive mode
quark add service-name
quark remove service-name
```


## Quick Start

The setup will guide you through:

1. Choosing between local (k3d) or remote cluster
2. Selecting services to run
3. Cloning required repositories
4. Configuring services for local development

## Development Workflow

### Setting Up Local Development

When setting up the environment, you can choose which services to develop locally.
This will:

1. Clone the service repository
2. Configure k3d/k3s for local development
3. Mount your local code into the cluster
4. Set up development dependencies

### Managing Local Services

Add a service for local development:

```bash
quark add service-name
```

Remove a service from local development:

```bash
quark remove service-name
```

### Cluster Configuration

The tool uses k3d/k3s to create and manage a local Kubernetes cluster. It:

- Automatically sets up required k3d cluster resources
- Configures node labels and taints for proper scheduling
- Sets up volume mounts for persistent storage
- Configures networking for service access

### Service Dependencies

The tool automatically handles service dependencies:

- Core services (Redis, MySQL, etc.)
- Required supporting services
- Network configuration

## Local Development Features

The tool provides several development-focused features:

1. **Hot Reload**: Changes to your local code are automatically reflected in the cluster
2. **Development Profiles**:
   - Bot Development: Core services + Beta bot services
   - Website Development: Core services + Website components
   - Full Stack: Complete beta environment with all services
3. **Debug Support**: 
   - Port forwarding for remote debugging
   - Log aggregation across services
   - Metrics and tracing integration

You can also create custom configurations by selecting individual services.

## Service Groups

The environment is organized into three main service groups:

### Core Services

- Redis
- NATS
- Aerospike
- MySQL
- Elasticsearch

### Application Services

- Bot services (Beta, Main, Pro)
- Gateway services
- Website services
- Cache and storage services

### Other Services

- Cloudflared
- GitHub Actions runners