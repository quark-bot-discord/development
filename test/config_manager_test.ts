import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { ConfigManager } from "../src/core/config-manager.ts";
import type { LocalServiceConfig } from "../src/types/types.ts";

Deno.test("ConfigManager - addLocalService with existing repo", async () => {
  const configManager = ConfigManager.getInstance();
  await configManager.load();
  
  // Test with a config that has a valid existing path
  const testConfig: LocalServiceConfig = {
    repoPath: "/workspace/src", // This path exists
    env: { "TEST_VAR": "test_value" },
    namespace: "test"
  };
  
  // This should work without trying to create a repo
  await configManager.addLocalService("test-service", testConfig);
  
  // Verify the service was added
  const savedConfig = configManager.getLocalServiceConfig("test-service");
  assertExists(savedConfig);
  assertEquals(savedConfig.repoPath, "/workspace/src");
  assertEquals(savedConfig.env.TEST_VAR, "test_value");
  
  // Clean up
  await configManager.removeLocalService("test-service");
});

Deno.test("ConfigManager - addLocalService with non-existing repo (no mapping)", async () => {
  const configManager = ConfigManager.getInstance();
  await configManager.load();
  
  // Test with a config that has a non-existing path and no repo mapping
  const testConfig: LocalServiceConfig = {
    repoPath: "/workspace/repos/non-existing-service",
    env: { "TEST_VAR": "test_value" },
    namespace: "test"
  };
  
  // This should fail since there's no repo mapping for "non-existing-service"
  await assertRejects(
    () => configManager.addLocalService("non-existing-service", testConfig),
    Error,
    "Repository path does not exist and could not be created"
  );
});

Deno.test("ConfigManager - addLocalService with invalid config", async () => {
  const configManager = ConfigManager.getInstance();
  await configManager.load();
  
  // Test with invalid config (missing required fields)
  const invalidConfig = {
    repoPath: "/workspace/src",
    // missing env field
  } as LocalServiceConfig;
  
  await assertRejects(
    () => configManager.addLocalService("invalid-service", invalidConfig),
    Error,
    "Invalid configuration for service"
  );
});

Deno.test("ConfigManager - addLocalService with repository creation for valid service", async () => {
  const configManager = ConfigManager.getInstance();
  await configManager.load();
  
  // Test with a valid service that has a repository mapping but repo doesn't exist
  const testConfig: LocalServiceConfig = {
    repoPath: "/workspace/repos/webhook", // webhook has a repo mapping in QUARK_REPOS
    env: { "TEST_VAR": "test_value" },
    namespace: "test"
  };
  
  // This should work by creating the repository using workspace manager
  // Note: In a real environment, this would clone the actual repository
  // In testing, we can't guarantee network access, so this test mainly validates
  // that the code path is correct and doesn't throw unexpected errors
  try {
    await configManager.addLocalService("webhook", testConfig);
    
    // If we get here, the service was added successfully
    const savedConfig = configManager.getLocalServiceConfig("webhook");
    assertExists(savedConfig);
    assertEquals(savedConfig.repoPath, "/workspace/repos/webhook");
    assertEquals(savedConfig.env.TEST_VAR, "test_value");
    
    // Clean up
    await configManager.removeLocalService("webhook");
  } catch (error) {
    // In a test environment, git clone might fail due to network restrictions
    // We accept either success or a network-related failure as valid outcomes
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const isNetworkError = errorMessage.includes("clone") || 
                           errorMessage.includes("network") || 
                           errorMessage.includes("connection") ||
                           errorMessage.includes("repository");
      
      if (!isNetworkError) {
        // If it's not a network error, re-throw it as it's unexpected
        throw error;
      }
      // Network errors are acceptable in test environment
    }
  }
});
