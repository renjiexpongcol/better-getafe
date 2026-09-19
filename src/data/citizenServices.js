// Service definitions shared by portal search and application validation.
// The catalogue is drawn from the municipality's existing service pages.
export const serviceCategories = [
  { id: 'certificates', name: 'Certificates & IDs', description: 'Civil records, IDs and municipal certificates', icon: 'FileText' },
  { id: 'business', name: 'Business & Trade', description: 'Business registration, permits and clearances', icon: 'BriefcaseBusiness' },
  { id: 'treasury', name: 'Treasury & Settlements', description: 'Settle local obligations and revenue-related fees', icon: 'WalletCards' },
  { id: 'health', name: 'Health Services', description: 'Health care, assistance and community programs', icon: 'HeartPulse' },
  { id: 'education', name: 'Education', description: 'Scholarships, financial aid and skills training', icon: 'GraduationCap' },
]

export const citizenServices = [
  ['barangay-clearance', 'Barangay Clearance', 'certificates'],
  ['barangay-id', 'Barangay ID', 'certificates'],
  ['indigency', 'Certificate of Indigency', 'certificates'],
  ['residency', 'Local Residency Certificate', 'certificates'],
  ['cedula', 'Community Tax Certificate (Cedula)', 'certificates'],
  ['birth-certificate', 'Birth Certificate Request', 'certificates'],
  ['business-permit', 'New Business Permit', 'business'],
  ['business-renewal', 'Business Permit Renewal', 'business'],
  ['business-clearance', 'Barangay Clearance (Business)', 'business'],
  ['tax-clearance', 'Certificate of No Tax Delinquency', 'business'],
  ['ordinance-violation-settlement', 'Ordinance Violation Settlement', 'treasury'],
  ['public-market-stall-settlement', 'Public Market Stall Fees', 'treasury'],
  ['miscellaneous-fees-settlement', 'Miscellaneous Fees', 'treasury'],
  ['transport-franchise-settlement', 'Transport Franchise Fees', 'treasury'],
  ['health-card', 'Health Cards / PhilHealth', 'health'],
  ['vaccination', 'Vaccination Programs', 'health'],
  ['medical-assistance', 'Medical Assistance', 'health'],
  ['maternal-health', 'Maternal & Child Health', 'health'],
  ['senior-citizen', 'Senior Citizen & PWD Benefits', 'health'],
  ['scholarship', 'Municipal Scholarship Program', 'education'],
  ['school-assistance', 'School Assistance / Financial Aid', 'education'],
  ['skills-training', 'Skills Training Programs', 'education'],
  ['als', 'Alternative Learning System', 'education'],
].map(([id, name, category]) => ({ id, name, category }))

export const serviceLink = service => service.category === 'treasury'
  ? `/app/payments?settlement=${encodeURIComponent(service.name.replace(/ Settlement$| Fees$/g, ''))}`
  : `/app/requests/new?service=${encodeURIComponent(service.id)}`
export function searchServices(query, category = '') {
  const words = query.toLowerCase().trim().split(/\s+/)
  return citizenServices.filter(service => (!category || service.category === category) && words.every(word => `${service.name} ${serviceCategories.find(item => item.id === service.category)?.name}`.toLowerCase().includes(word)))
}
