# Quark Development Environment

This repository contains tools and configurations for easily setting up a development environment for Quark services.

## Getting Started

This project uses VS Code's [Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers) for development. All required tools and dependencies are automatically installed in the container.

1. Install [VS Code](https://code.visualstudio.com/)
2. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
3. Clone this repository
4. Open in VS Code and click "Reopen in Container" when prompted

The development container includes all necessary tools:
- Deno runtime
- Kubernetes tools (kubectl, k3d)
- Git and development utilities
- All required VS Code extensions

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

# Start configured local services
quark start

# Update submodules to latest versions
quark update-submodules

# Clean up development environment
quark cleanup

# Non-interactive mode
quark add service-name
quark remove service-name
```

The `quark` command is automatically available in the dev container. All dependencies and tools are pre-installed and configured for you.

## Development Features

The environment provides several developer-focused features:

1. **VS Code Integration**:
   - Automatic workspace configuration
   - Recommended extensions
   - Debug configurations
   - File exclusion patterns

2. **Development Tooling**:
   - Hot reload for local development
   - Automatic service dependency resolution
   - Submodule management
   - Service health monitoring

3. **Flexible Configuration**:
   - Multiple development profiles
   - Custom service selection
   - Local or remote cluster support
   - Environment variable management

4. **Debug Support**: 
   - Port forwarding for remote debugging
   - Log aggregation across services
   - Kubernetes integration
   - Local development shortcuts

## Quick Start

The setup will guide you through:

1. Choosing between local (k3d) or remote cluster
2. Selecting services to run
3. Cloning required repositories
4. Configuring services for local development

## Development Workflow

### Setting Up Local Development

When setting up the environment (`quark setup`), you'll be guided through:

1. Selecting a development profile or custom service selection
2. Choosing between local (k3d) or remote cluster
3. Updating submodules (predefined configs) if updates are available
4. Setting up the kubernetes cluster
5. Cloning required service repositories
6. Creating a VS Code workspace configuration

The setup process will:

1. Configure the kubernetes cluster (local or remote)
2. Set up all required infrastructure services
3. Clone and configure service repositories
4. Mount local code into the cluster for development
5. Set up all necessary development dependencies

### Development Profiles

The environment comes with several pre-configured development profiles:

- **Bot Development**: Beta bot services for bot development
- **Website Development**: Website services for frontend development
- **Gateway Development**: Gateway services for API development
- **Helper Development**: Helper bot development environment
- **Full Stack Development**: Complete development environment with all core services

You can also create custom configurations by selecting individual services during setup.

### Managing Local Services

The environment provides several commands for managing your local development:

```bash
# Add services to local development (interactive)
quark add

# Remove services from local development (interactive)
quark remove

# Start all configured local services
quark start

# Update submodules to latest versions
quark update-submodules

# Clean up the development environment
quark cleanup
```

You can also use non-interactive mode for service management:

```bash
quark add service-name
quark remove service-name
```

### Cluster Configuration

The tool uses k3d/k3s to create and manage a local Kubernetes cluster. It:

- Automatically sets up required k3d cluster resources
- Configures node labels and taints for proper scheduling
- Sets up volume mounts for persistent storage
- Configures networking for service access

### Service Dependencies

The tool automatically handles all service dependencies:

- Core infrastructure services (Redis, MySQL, NATS, etc.)
- Required supporting services and configurations
- Network and storage configuration
- Service interconnections and environment variables

## Service Groups

The environment is organized into four main service groups:

### Core Services
Infrastructure services that support all other components:
- Redis
- MySQL
- NATS
- Elastic Search
- Aerospike

### Application Services
Main application components:
- Bot (Discord bot)
- Gateway (API Gateway)
- Gluon Cache
- Helper / Helper v2
- Quark Subscriptions
- Asset Storage
- Temp Storage

### Web Services
Frontend and web-related services:
- Website
- Website Realtime
- Commands Webserver
- Status Page
- Blog
- Documentation

### Tool Services
Development and administrative tools:
- Database Tools
- Webhook Services
- Register Emojis
- Workers
- K8s Health Check