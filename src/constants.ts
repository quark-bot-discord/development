import type { ServiceGroup } from "./types.ts";
import { ServiceManager } from "./service-manager.ts";

// Service groups will be populated dynamically from k8s manifests
export const SERVICE_GROUPS: Record<string, ServiceGroup> = await ServiceManager.getInstance().getAvailableServices();

export const SERVICE_DEPENDENCIES: Record<string, string[]> = {
  "beta-bot": ["redis", "mysql", "nats", "gluon-cache", "pro-proxy"],
  "main-bot": ["redis", "mysql", "nats", "gluon-cache", "main-proxy"],
  "pro-bot": ["redis", "mysql", "nats", "gluon-cache", "pro-proxy"],
  "gluon-cache": ["redis", "mysql", "nats", "elasticsearch"],
  "website-beta": ["redis", "mysql", "website-realtime"],
  "website-main": ["redis", "mysql", "website-realtime"],
  "quark-subscriptions": ["redis", "mysql"],
  "asset-storage": ["redis", "mysql", "nats"],
};

export const DEVELOPMENT_PROFILES = {
  "bot-development": {
    name: "Bot Development",
    description: "Beta bot services for bot development",
    services: ["beta-bot", "beta-gateway"],
  },
  "website-development": {
    name: "Website Development",
    description: "Website services for frontend development",
    services: ["website-beta", "website-realtime"],
  },
  "cache-development": {
    name: "Cache Development",
    description: "Cache and storage services development",
    services: ["gluon-cache", "asset-storage"],
  },
  "subscriptions-development": {
    name: "Subscriptions Development",
    description: "Subscription service development environment",
    services: ["quark-subscriptions"],
  },
  "full-stack": {
    name: "Full Stack Development",
    description: "Complete beta development environment",
    services: [
      "beta-bot",
      "beta-gateway",
      "gluon-cache",
      "asset-storage",
      "quark-subscriptions",
      "website-beta",
      "website-realtime",
    ],
  },
};

export const QUARK_REPOS: Record<string, string> = {
  "beta-bot": "quark-bot-discord/serverlog",
  "main-bot": "quark-bot-discord/serverlog",
  "pro-bot": "quark-bot-discord/serverlog",
  "gluon-cache": "quark-bot-discord/gluon-cache",
  "website-beta": "quark-bot-discord/website",
  "website-main": "quark-bot-discord/website",
  "website-realtime": "quark-bot-discord/website-realtime",
  "asset-storage": "quark-bot-discord/asset-storage-node",
  "quark-subscriptions": "quark-bot-discord/quark-subscriptions",
};
