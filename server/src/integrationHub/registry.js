import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { HubError, approvedUrl, safeRequest, testLocalTwenty } from './security.js';
import { verifyTimestampedHmac } from '../services/eservicePaymentProviders.js';

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const schema = properties => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = title => ({ type: 'string', title, minLength: 1, maxLength: 200 });
const definitions = [
  {
    id: 'twenty-local', name: 'Twenty CRM', provider: 'Twenty',
    description: 'Test read access to People on the integration worker’s localhost:2020.',
    authentication: 'api_key', configuration: schema({}),
    credentials: schema({ apiKey: { ...text('Twenty API key or bearer token'), maxLength: 4096 } }),
    operations: ['test_connection'], webhookEvents: [],
  },
  { id: 'approved-api', name: 'Approved external API', provider: 'Municipal API partner', description: 'Read-only health checks for an approved HTTPS API.', authentication: 'api_key', configuration: schema({ baseUrl: { ...text('API health URL'), format: 'uri' } }), credentials: schema({ apiKey: { ...text('Bearer API key'), maxLength: 4096 } }), operations: ['test_connection'], webhookEvents: [] },
  { id: 'google-calendar', name: 'Google Calendar', provider: 'Google', description: 'Read-only calendar access with a separate administrator grant.', authentication: 'oauth2', configuration: schema({ clientId: text('OAuth client ID') }), credentials: schema({ clientSecret: { ...text('OAuth client secret'), maxLength: 4096 } }), operations: ['test_connection'], webhookEvents: [], scopes: ['https://www.googleapis.com/auth/calendar.calendarlist.readonly'] },
  { id: 'municipal-events', name: 'Municipal event intake', provider: 'Approved municipal partner', description: 'Accept signed, versioned record status events.', authentication: 'webhook_secret', configuration: schema({ sourceSystem: text('Source system') }), credentials: schema({ webhookSecret: { ...text('Signing secret'), minLength: 32, maxLength: 4096 } }), operations: ['receive_webhook'], webhookEvents: ['record.status.changed'] },
].map(definition => ({ ...definition, configuration: { ...definition.configuration, properties: { ...definition.configuration.properties, dailyRequestLimit: { type: 'integer', title: 'Daily execution limit', minimum: 1, maximum: 100000, default: 1000 }, failureAlertPercent: { type: 'integer', title: 'Failure alert threshold (%)', minimum: 1, maximum: 100, default: 50 } } }, version: '1.0.0', permissions: ['integrations.test'], timeoutMs: 10000, retryPolicy: { attempts: 4, idempotent: true }, rateLimit: { intervalMs: 1000, concurrency: 1 }, transformationVersion: 1 }));
const validators = new Map(definitions.map(d => [d.id, { configuration: ajv.compile(d.configuration), credentials: ajv.compile(d.credentials) }]));
export const registry = Object.freeze(definitions);
export function connector(id) { const value = registry.find(item => item.id === id); if (!value) throw new HubError('unknown_connector', 404); return value; }
export function validateConfiguration(id, value, env = process.env) {
  connector(id);
  if (!validators.get(id).configuration(value)) throw new HubError('invalid_configuration');
  if (id === 'approved-api') approvedUrl(value.baseUrl, (env.INTEGRATION_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}
export function validateCredentials(id, value) {
  connector(id);
  if (!validators.get(id).credentials(value) || Object.values(value).some(s => /[\r\n\0]/.test(s))) throw new HubError('invalid_credentials');
}
export const eventSchema = schema({ id: text('External event ID'), type: { type: 'string', const: 'record.status.changed' }, version: { type: 'integer', const: 1 }, timestamp: { type: 'string', format: 'date-time' }, externalRecordId: text('External record ID'), status: { type: 'string', enum: ['pending', 'completed', 'failed'] } });
const validateEvent = ajv.compile(eventSchema);
export function webhookEvent(raw, headers, credentials, configuration, now = Date.now()) {
  if (!verifyTimestampedHmac(raw, { signature: headers['x-integration-signature'], timestamp: headers['x-integration-timestamp'], secret: credentials.webhookSecret, now })) throw new HubError('invalid_webhook_signature', 401);
  let event; try { event = JSON.parse(raw.toString('utf8')); } catch { throw new HubError('invalid_webhook_payload', 400); }
  if (!validateEvent(event)) throw new HubError('invalid_webhook_payload', 400);
  return { externalRecordId: event.externalRecordId, providerId: 'municipal-events', eventId: event.id, eventType: event.type, timestamp: new Date(event.timestamp).toISOString(), processingStatus: 'accepted', sourceSystem: configuration.sourceSystem, extensions: { status: event.status }, version: 1 };
}
export async function executeConnector(installation, credentials, operation, { request = safeRequest, env = process.env, signal } = {}) {
  const definition = connector(installation.connector_id);
  if (!definition.operations.includes(operation)) throw new HubError('unsupported_operation');
  if (operation === 'receive_webhook') return { bytes: 0, status: 200 };
  if (definition.id === 'twenty-local') {
    const token = credentials.apiKey?.trim().replace(/^Bearer\s+/i, '');
    if (!token || /\s/.test(token)) throw new HubError('invalid_credentials');
    return testLocalTwenty(token, definition.timeoutMs, signal);
  }
  const url = definition.id === 'google-calendar' ? 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1&fields=kind' : installation.configuration.baseUrl;
  const token = definition.id === 'google-calendar' ? credentials.accessToken : credentials.apiKey;
  if (!token) throw new HubError('credentials_required', 409);
  return request(url, { allowedHosts: definition.id === 'google-calendar' ? ['www.googleapis.com'] : (env.INTEGRATION_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeoutMs: definition.timeoutMs, signal });
}
