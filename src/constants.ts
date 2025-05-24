export const SERVICE_GROUPS = {
  core: {
    name: "Core Services",
    services: ["redis", "mysql", "nats", "elasticsearch"],
  },
  apps: {
    name: "Application Services",
    services: ["beta-bot", "main-bot", "pro-bot", "gluon-cache"],
  },
  web: {
    name: "Web Services",
    services: ["website-beta", "website-main", "website-realtime"],
  },
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
};

export const QUARK_REPOS = {
  "beta-bot": "github.com/quark/beta-bot",
  "website-beta": "github.com/quark/website-beta",
};
