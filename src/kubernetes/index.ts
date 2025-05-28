/**
 * @fileoverview Kubernetes-related modules for manifest generation and cluster operations.
 * 
 * This module provides Kubernetes-specific functionality:
 * - ManifestGenerator: Generates K8s manifests for infrastructure and application services
 * - KubernetesManifest: Type definitions for Kubernetes resources
 */

// Kubernetes-related modules
export { ManifestGenerator } from './manifest-generator.ts';
export type { KubernetesManifest } from './manifests/manifest-types.ts';
