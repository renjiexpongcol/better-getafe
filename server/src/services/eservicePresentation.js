// Explicit public projection: never send staff workflow, permissions or routing rules.
export function publicService(service) {
  const keys = ['id', 'slug', 'name', 'kind', 'category_id', 'category_name', 'category_slug', 'department_name',
    'short_description', 'description', 'eligibility', 'instructions', 'processing_time',
    'contact', 'online_available', 'payment_required', 'hero_url', 'processing_information', 'service_steps', 'important_reminders'];
  const result = Object.fromEntries(keys.filter(key => Object.hasOwn(service, key)).map(key => [key, service[key]]));
  result.settings = { workflow_type: service.settings?.workflow_type || (service.kind === 'BUSINESS' ? 'ASSESSMENT_PAYMENT' : service.kind === 'DIRECTORY' ? 'INFORMATION' : 'APPLICATION'), directory_category_id: service.settings?.directory_category_id || '' };
  if (service.requirements) result.requirements = service.requirements.map(({ id, label, help_text, required }) => ({ id, label, help_text, required }));
  if (service.fees) result.fees = service.fees.map(({ code, description, amount, fee_type }) => ({ code, description, amount, fee_type }));
  return result;
}
