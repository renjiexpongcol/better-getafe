-- Preserve the former public OfficeDetail summaries as editable CMS content.
-- Do not add programmes, contact details, fees, or eligibility requirements.
UPDATE departments d SET content = jsonb_build_object('description', legacy.description) || d.content
FROM (VALUES
('executive', 'The Office of the Mayor and executive offices coordinate municipal programs, policy, and public service delivery.'),
('engineering', 'Find municipal engineering information, infrastructure coordination, and public works support.'),
('zoning-planning', 'Get guidance on land use, development planning, zoning clearances, and local planning requirements.'),
('treasury', 'Access local tax, payment, business, and revenue-related information from the Municipal Treasurer.'),
('assessment', 'Learn about property assessment, tax declarations, and assessment office transactions.'),
('civil-registry', 'Find information about birth, marriage, death, and other civil registry document requests.'),
('health', 'Connect with municipal health programs, public health services, and rural health support.'),
('social-welfare', 'Find assistance programs and social welfare support for families, children, senior citizens, and vulnerable residents.')
) AS legacy(id, description)
WHERE d.id = legacy.id AND NOT (d.content ? 'description');
