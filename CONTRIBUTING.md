# Quark Development Environment

## Module Descriptions

### 🏗️ Core (`src/core/`)
The foundation of the system, handling:
- **Cluster Management**: Kubernetes cluster lifecycle (k3d, remote clusters)
- **Configuration**: Persistent storage of dev environment settings
- **Service Dependencies**: Resolution and health checking

### 🛠️ Development (`src/development/`)
Development workflow support:
- **Environment Orchestration**: Complete dev environment setup
- **Logging**: Standardized, colored console output

### ☸️ Kubernetes (`src/kubernetes/`)
Kubernetes-specific operations:
- **Manifest Generation**: Dynamic K8s resource creation
- **YAML Processing**: Serialization and preprocessing

### 🔧 Services (`src/services/`)
Service discovery and management:
- **Dynamic Loading**: Auto-discovery of service configs from `q4/`
- **Local Execution**: Running services in development mode
- **Type Definitions**: Complete service configuration schemas

### 📝 Types (`src/types/`)
Shared type definitions used across all modules.

## Design Principles

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Dependency Injection**: Modules are loosely coupled with clear interfaces
3. **Type Safety**: Comprehensive TypeScript typing throughout
4. **Testability**: Each module can be tested in isolation

## Usage Examples

### Basic Usage
```typescript
import { EnvironmentInitializer } from './src/development/modules/environment-initializer.ts';
import { Logger } from './src/development/logger.ts';

const initializer = new EnvironmentInitializer();
await initializer.setup();
```

### Direct Module Imports
```typescript
// Import directly from source files for better tree-shaking and clarity
import { ClusterManager } from './src/core/cluster-manager.ts';
import { ManifestGenerator } from './src/kubernetes/manifest-generator.ts';

const cluster = ClusterManager.getInstance();
const generator = new ManifestGenerator();
```

### Service Management
```typescript
import { getApplicationServices } from './src/services/service-loader.ts';
import { ServiceRunner } from './src/services/service-runner.ts';

const services = await getApplicationServices();
const runner = ServiceRunner.getInstance();
```

## Contributing

When adding new functionality:

1. **Choose the Right Module**: Place new code in the appropriate module based on its responsibility
2. **Document**: Add JSDoc comments for public APIs
3. **Test**: Write tests in the corresponding test file
4. **Type Safety**: Ensure all new code is properly typed

## Testing

Each module has corresponding test files in the `test/` directory:
- `test/cluster_manager_test.ts`
- `test/dev_environment_test.ts`
- `test/service_loader_test.ts`
- etc.

Run all tests:
```bash
deno test
```

Run specific module tests:
```bash
deno test test/cluster_manager_test.ts
```
