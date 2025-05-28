import { assertEquals, assertExists, assertInstanceOf, assertStringIncludes } from "jsr:@std/assert";
import { ManifestGenerator } from "../src/manifest-generator.ts";
import { getInfrastructureServices } from "../src/infra-service-loader.ts";
import { getApplicationServices } from "../src/service-loader.ts";
import type { KubernetesManifest } from "../src/manifest-generator.ts";

Deno.test("Manifest Generator - Infrastructure service manifests", async () => {
  const generator = new ManifestGenerator();
  const infraServices = await getInfrastructureServices();
  const redis = infraServices["redis"];
  
  assertExists(redis);
  
  const manifests = generator.generateInfraServiceManifests(redis);
  
  // Redis should generate PV, PVC, Deployment, and Service manifests
  assertEquals(manifests.length, 4);
  
  const kinds = manifests.map(m => m.kind);
  assertEquals(kinds.includes("PersistentVolume"), true);
  assertEquals(kinds.includes("PersistentVolumeClaim"), true);
  assertEquals(kinds.includes("Deployment"), true);
  assertEquals(kinds.includes("Service"), true);
});

Deno.test("Manifest Generator - Infrastructure service with secrets", async () => {
  const generator = new ManifestGenerator();
  const infraServices = await getInfrastructureServices();
  const mysql = infraServices["mysql"];
  
  assertExists(mysql);
  assertExists(mysql.secrets);
  
  const manifests = generator.generateInfraServiceManifests(mysql);
  
  // MySQL should generate PV, PVC, Secret, Deployment, and Service manifests
  assertEquals(manifests.length, 5);
  
  const kinds = manifests.map(m => m.kind);
  assertEquals(kinds.includes("Secret"), true);
  
  // Find the Secret manifest
  const secretManifest = manifests.find(m => m.kind === "Secret");
  assertExists(secretManifest);
  assertEquals(secretManifest.metadata.name, "mysql-secrets");
  
  // Check that secret data is properly set
  const secretData = (secretManifest.spec as any).stringData;
  assertExists(secretData);
  assertExists(secretData.MYSQL_ROOT_PASSWORD);
  assertExists(secretData.MYSQL_PASSWORD);
  
  // Find the Deployment manifest and check it references the secret
  const deploymentManifest = manifests.find(m => m.kind === "Deployment");
  assertExists(deploymentManifest);
  
  const container = (deploymentManifest.spec as any).template.spec.containers[0];
  assertExists(container.envFrom);
  
  const secretRef = container.envFrom.find((ref: any) => ref.secretRef);
  assertExists(secretRef);
  assertEquals(secretRef.secretRef.name, "mysql-secrets");
});

Deno.test("Manifest Generator - Application service manifests", async () => {
  const generator = new ManifestGenerator();
  const appServices = await getApplicationServices();
  const website = appServices["website"];
  
  assertExists(website);
  
  const manifests = generator.generateAppServiceManifests(website, "app-services");
  
  // Website should generate ConfigMap, Deployment, and Service manifests
  assertEquals(manifests.length, 3);
  
  const kinds = manifests.map(m => m.kind);
  assertEquals(kinds.includes("ConfigMap"), true);
  assertEquals(kinds.includes("Deployment"), true);
  assertEquals(kinds.includes("Service"), true);
});

Deno.test("Manifest Generator - YAML generation", async () => {
  const generator = new ManifestGenerator();
  const infraServices = await getInfrastructureServices();
  const redis = infraServices["redis"];
  
  assertExists(redis);
  
  const manifests = generator.generateInfraServiceManifests(redis);
  const yaml = generator.manifestsToYaml(manifests);
  
  assertExists(yaml);
  assertEquals(typeof yaml, "string");
  assertEquals(yaml.length > 0, true);
  
  // Check that YAML contains expected content
  assertStringIncludes(yaml, "apiVersion:");
  assertStringIncludes(yaml, "kind:");
  assertStringIncludes(yaml, "metadata:");
  assertStringIncludes(yaml, "spec:");
  assertStringIncludes(yaml, "redis");
  assertStringIncludes(yaml, "core-services");
  
  // Check that manifests are separated by ---
  assertEquals(yaml.includes("---"), true);
});

Deno.test("Manifest Generator - Service port detection", async () => {
  const generator = new ManifestGenerator();
  const appServices = await getApplicationServices();
  
  // Test different service types and their port detection
  const testCases = [
    { serviceName: "website", expectedPorts: 1 },
    { serviceName: "gateway", expectedPorts: 1 },
    { serviceName: "bot", expectedPorts: 0 }
  ];
  
  for (const testCase of testCases) {
    const service = appServices[testCase.serviceName];
    if (service) {
      const manifests = generator.generateAppServiceManifests(service, "app-services");
      const serviceManifest = manifests.find(m => m.kind === "Service");
      
      if (testCase.expectedPorts > 0) {
        assertExists(serviceManifest, `${testCase.serviceName} should have a Service manifest`);
        const ports = (serviceManifest!.spec as any).ports;
        assertEquals(ports.length, testCase.expectedPorts, `${testCase.serviceName} should have ${testCase.expectedPorts} port(s)`);
      } else {
        assertEquals(serviceManifest, undefined, `${testCase.serviceName} should not have a Service manifest`);
      }
    }
  }
});

Deno.test("Manifest Generator - Resource limits and requests", async () => {
  const generator = new ManifestGenerator();
  const appServices = await getApplicationServices();
  const website = appServices["website"];
  
  assertExists(website);
  
  const manifests = generator.generateAppServiceManifests(website, "app-services");
  const deploymentManifest = manifests.find(m => m.kind === "Deployment");
  
  assertExists(deploymentManifest);
  
  const container = (deploymentManifest.spec as any).template.spec.containers[0];
  assertExists(container.resources);
  assertExists(container.resources.requests);
  assertExists(container.resources.limits);
  
  // Check specific resource values
  assertEquals(container.resources.requests.memory, "128Mi");
  assertEquals(container.resources.requests.cpu, "100m");
  assertEquals(container.resources.limits.memory, "512Mi");
  assertEquals(container.resources.limits.cpu, "500m");
});
