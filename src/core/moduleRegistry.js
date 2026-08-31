/**
 * Core Module Registry
 * Defines available modules in the Better Getafe ecosystem and their active state.
 */

const registry = {
  news: {
    name: "News & Announcements",
    enabled: true,
    description: "Municipal news, updates, and public announcements."
  },
  barangays: {
    name: "Barangays",
    enabled: true,
    description: "Information about local barangays."
  },
  tourism: {
    name: "Tourism",
    enabled: true,
    description: "Local attractions and tourism guides."
  },
  services: {
    name: "Government Services",
    enabled: true,
    description: "Online government services and forms."
  },
  marketplace: {
    name: "Local Marketplace",
    enabled: false,
    description: "Local business directory and marketplace."
  },
  events: {
    name: "Events Calendar",
    enabled: false,
    description: "Community events and scheduling."
  },
  integrations: {
    name: "Third-Party Integrations",
    enabled: true, // Core feature for admin
    description: "Manage connections to external services."
  }
};

export function getModules() {
  return registry;
}

export function isModuleEnabled(moduleId) {
  return registry[moduleId]?.enabled === true;
}

export function enableModule(moduleId) {
  if (registry[moduleId]) {
    registry[moduleId].enabled = true;
    return true;
  }
  return false;
}

export function disableModule(moduleId) {
  if (registry[moduleId]) {
    registry[moduleId].enabled = false;
    return true;
  }
  return false;
}
