import { assertEquals, assertExists, assertInstanceOf } from "jsr:@std/assert";
import { SERVICE_GROUPS, DEVELOPMENT_PROFILES, QUARK_REPOS } from "../q4/const/constants.ts";

Deno.test("Constants - SERVICE_GROUPS structure", () => {
  assertExists(SERVICE_GROUPS);
  assertInstanceOf(SERVICE_GROUPS, Object);
  
  // Check that required service groups exist
  assertExists(SERVICE_GROUPS.core);
  assertExists(SERVICE_GROUPS.apps);
  assertExists(SERVICE_GROUPS.web);
  assertExists(SERVICE_GROUPS.tools);
  
  // Check structure of core services group
  assertEquals(SERVICE_GROUPS.core.name, "Core Services");
  assertExists(SERVICE_GROUPS.core.services);
  assertEquals(Array.isArray(SERVICE_GROUPS.core.services), true);
  
  // Core services should include infrastructure components
  const coreServices = SERVICE_GROUPS.core.services;
  assertEquals(coreServices.includes("redis"), true);
  assertEquals(coreServices.includes("mysql"), true);
  assertEquals(coreServices.includes("nats"), true);
  assertEquals(coreServices.includes("elastic-search"), true);
  assertEquals(coreServices.includes("aerospike"), true);
});

Deno.test("Constants - DEVELOPMENT_PROFILES structure", () => {
  assertExists(DEVELOPMENT_PROFILES);
  assertInstanceOf(DEVELOPMENT_PROFILES, Object);
  
  // Check that required profiles exist
  assertExists(DEVELOPMENT_PROFILES["webhook-development"]);
  assertExists(DEVELOPMENT_PROFILES["bot-development"]);
  assertExists(DEVELOPMENT_PROFILES["website-development"]);
  assertExists(DEVELOPMENT_PROFILES["gateway-development"]);
  assertExists(DEVELOPMENT_PROFILES["helper-development"]);
  assertExists(DEVELOPMENT_PROFILES["full-development"]);
  
  // Check structure of a profile
  const botProfile = DEVELOPMENT_PROFILES["bot-development"];
  assertExists(botProfile.name);
  assertExists(botProfile.description);
  assertExists(botProfile.services);
  assertEquals(Array.isArray(botProfile.services), true);
  
  // Bot development should include core services
  assertEquals(botProfile.services.includes("redis"), true);
  assertEquals(botProfile.services.includes("mysql"), true);
  assertEquals(botProfile.services.includes("nats"), true);
});

Deno.test("Constants - QUARK_REPOS mapping", () => {
  assertExists(QUARK_REPOS);
  assertInstanceOf(QUARK_REPOS, Object);
  
  // Check that key application services have repo mappings
  assertExists(QUARK_REPOS.bot);
  assertExists(QUARK_REPOS.gateway);
  assertExists(QUARK_REPOS.website);
  assertExists(QUARK_REPOS["website-realtime"]);
  assertExists(QUARK_REPOS["gluon-cache"]);
  assertExists(QUARK_REPOS["asset-storage"]);
  
  // Check that repo names are strings
  assertEquals(typeof QUARK_REPOS.bot, "string");
  assertEquals(typeof QUARK_REPOS.gateway, "string");
  assertEquals(typeof QUARK_REPOS.website, "string");
  
  // Check specific mappings
  assertEquals(QUARK_REPOS.bot, "serverlog");
  assertEquals(QUARK_REPOS.gateway, "gluon_gateway");
  assertEquals(QUARK_REPOS.website, "website");
});

Deno.test("Constants - Service group consistency", () => {
  // All services in QUARK_REPOS should be categorized in SERVICE_GROUPS
  const allGroupServices = Object.values(SERVICE_GROUPS)
    .flatMap(group => group.services);
  
  for (const serviceName of Object.keys(QUARK_REPOS)) {
    assertEquals(
      allGroupServices.includes(serviceName), 
      true, 
      `Service ${serviceName} should be in a SERVICE_GROUP`
    );
  }
});

Deno.test("Constants - Development profile service validity", () => {
  // All services in development profiles should exist in SERVICE_GROUPS
  const allGroupServices = Object.values(SERVICE_GROUPS)
    .flatMap(group => group.services);
  
  for (const [profileName, profile] of Object.entries(DEVELOPMENT_PROFILES)) {
    for (const serviceName of profile.services) {
      assertEquals(
        allGroupServices.includes(serviceName),
        true,
        `Service ${serviceName} in profile ${profileName} should exist in SERVICE_GROUPS`
      );
    }
  }
});

Deno.test("Constants - Full development profile completeness", () => {
  const fullProfile = DEVELOPMENT_PROFILES["full-development"];
  
  // Full development should include all core services
  const coreServices = SERVICE_GROUPS.core.services;
  for (const coreService of coreServices) {
    assertEquals(
      fullProfile.services.includes(coreService),
      true,
      `Full development profile should include core service ${coreService}`
    );
  }
  
  // Should include representative services from other groups
  assertEquals(fullProfile.services.length > 10, true, "Full development should include many services");
});

Deno.test("Constants - Service group names and descriptions", () => {
  for (const [groupKey, group] of Object.entries(SERVICE_GROUPS)) {
    assertExists(group.name, `Group ${groupKey} should have a name`);
    assertEquals(typeof group.name, "string", `Group ${groupKey} name should be a string`);
    assertEquals(group.name.length > 0, true, `Group ${groupKey} name should not be empty`);
    
    assertExists(group.services, `Group ${groupKey} should have services`);
    assertEquals(Array.isArray(group.services), true, `Group ${groupKey} services should be an array`);
    assertEquals(group.services.length > 0, true, `Group ${groupKey} should have at least one service`);
  }
});
