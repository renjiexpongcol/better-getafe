import './bootstrap.js';
import { ConfigService } from './ConfigService.js';
import { DatabaseSettingsProvider } from './DatabaseSettingsProvider.js';
import { SecretProvider } from './SecretProvider.js';
export const config = new ConfigService({ provider: new DatabaseSettingsProvider(), secrets: new SecretProvider() });
