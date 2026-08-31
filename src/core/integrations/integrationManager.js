const activeIntegrations = new Map();

export function registerIntegration(id, providerInstance) {
  activeIntegrations.set(id, providerInstance);
}

export function getIntegration(id) {
  return activeIntegrations.get(id);
}

export function getAllIntegrations() {
  const result = [];
  activeIntegrations.forEach((provider, id) => {
    result.push({
      id,
      name: provider.name,
      type: provider.type,
      status: provider.status
    });
  });
  return result;
}
