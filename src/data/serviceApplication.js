// Shared resident presentation and CMS field binding contract.
export const PUBLIC_STATUS = Object.freeze({
  DRAFT: 'Draft', SUBMITTED: 'Submitted', RECEIVED: 'Under Review',
  IN_REVIEW: 'Under Review', NEEDS_INFORMATION: 'Additional Information Required',
  FOR_ASSESSMENT: 'Processing', AWAITING_PAYMENT: 'Payment Required',
  PAID: 'Processing', FOR_APPROVAL: 'Processing', APPROVED: 'Processing',
  FOR_RELEASE: 'Ready for Release', COMPLETED: 'Completed',
  REJECTED: 'Rejected/Unable to Process', CANCELLED: 'Cancelled',
});
export const publicStatus = status => PUBLIC_STATUS[status] || status || 'Submitted';
export const PROFILE_SOURCES = Object.freeze([
  'user_id', 'full_name', 'email', 'mobile', 'address', 'barangay',
  'birth_date', 'sex', 'civil_status', 'nationality',
]);
export function profileValues(user, profile = {}) {
  return {
    user_id: user.id, full_name: profile.full_name || user.name, email: user.email,
    mobile: profile.mobile || '', barangay: profile.barangay || '',
    birth_date: profile.birth_date ? new Date(profile.birth_date).toISOString().slice(0, 10) : '',
    sex: profile.sex || '', civil_status: profile.civil_status || '', nationality: profile.nationality || '',
    address: { house: profile.house_lot || '', street: profile.street || '',
      purok_sitio: profile.purok_sitio || '', barangay: profile.barangay || '',
      municipality: profile.municipality || '', province: profile.province || '', postal_code: profile.zip_code || '' },
  };
}
export function fieldProfileSource(field) {
  return field.profile_source || ({ name: 'full_name', applicant_name: 'full_name',
    contact_email: 'email', contact_number: 'mobile', telephone: 'mobile',
    applicant_address: 'address', resident_id: 'user_id' })[field.key] ||
    (PROFILE_SOURCES.includes(field.key) ? field.key : '');
}
export function applicationSections(fields) {
  const sections = [];
  for (const field of fields) {
    const name = field.section || (fieldProfileSource(field) ? 'Applicant information' : 'Service information');
    let section = sections.find(item => item.name === name);
    if (!section) { section = { name, fields: [] }; sections.push(section); }
    section.fields.push(field);
  }
  const applicant = sections.findIndex(section => section.name === 'Applicant information');
  if (applicant > 0) sections.unshift(...sections.splice(applicant, 1));
  return sections;
}
