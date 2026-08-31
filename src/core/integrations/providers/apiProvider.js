export class IntegrationProvider {
  /**
   * Base class for third-party integrations
   */
  constructor(name, type) {
    this.name = name;
    this.type = type; // e.g., 'API', 'Webhook', 'OAuth'
    this.status = 'Disconnected';
  }

  async connect(config) {
    throw new Error("Method 'connect()' must be implemented.");
  }

  async disconnect() {
    throw new Error("Method 'disconnect()' must be implemented.");
  }

  async testConnection() {
    throw new Error("Method 'testConnection()' must be implemented.");
  }
}
