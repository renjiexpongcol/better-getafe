// Population figures are from the 2020 Census of Population and Housing (PSA).
// captain = the Punong Barangay of each barangay.
// coords = approximate latitude/longitude used for the map view.

const barangayData = [
  {
    name: 'Alumar',
    population: 1203,
    captain: 'Jovelyn R. Camacho',
    coords: { lat: 10.1905, lng: 124.2051 },
  },
  {
    name: 'Banacon',
    population: 1524,
    captain: 'Jaime Jr D. Sanchez',
    heroImage: '/assets/baranggays/banacon/n060216banacon.jpg',
    coords: { lat: 10.208, lng: 124.14 },
  },
  {
    name: 'Buyog',
    population: 973,
    captain: 'Eva T. Suello',
    coords: { lat: 10.109, lng: 124.1515 },
  },
  {
    name: 'Cabasakan',
    population: 1287,
    captain: 'Marlon D. Torreon',
    coords: { lat: 10.1033, lng: 124.1919 },
  },
  {
    name: 'Campao Occidental',
    population: 535,
    captain: 'Rini Marcilini C. Mejias',
    coords: { lat: 10.1058, lng: 124.1351 },
  },
  {
    name: 'Campao Oriental',
    population: 1037,
    captain: 'Joseph C. Diacor',
    coords: { lat: 10.1037, lng: 124.1405 },
  },
  {
    name: 'Cangmundo',
    population: 934,
    captain: 'Eduard S. Enriquez',
    coords: { lat: 10.1065, lng: 124.2064 },
  },
  {
    name: 'Carlos P. Garcia',
    population: 1023,
    captain: 'Florendo B. Torreon',
    coords: { lat: 10.1389, lng: 124.173 },
  },
  {
    name: 'Corte Baud',
    population: 1045,
    captain: 'Crisanto A. Leoligao',
    coords: { lat: 10.1218, lng: 124.1373 },
  },
  {
    name: 'Handumon',
    population: 1269,
    captain: 'Rodulfo T. Botero',
    coords: { lat: 10.1697, lng: 124.1778 },
  },
  {
    name: 'Jagoliao',
    population: 1416,
    captain: 'Roberto S. Abellar',
    coords: { lat: 10.2051, lng: 124.1651 },
  },
  {
    name: 'Jandayan Norte',
    population: 1052,
    captain: 'Quirico T. Camacho',
    coords: { lat: 10.168, lng: 124.1739 },
  },
  {
    name: 'Jandayan Sur',
    population: 1718,
    captain: 'Eleuterio T. Botero',
    coords: { lat: 10.1623, lng: 124.1686 },
  },
  {
    name: 'Mahanay',
    population: 607,
    captain: 'Virgilio M. Leoligao',
    coords: { lat: 10.1843, lng: 124.2326 },
  },
  {
    name: 'Nasingin',
    population: 2115,
    captain: 'Melissa O. Vergara',
    coords: { lat: 10.1803, lng: 124.1344 },
  },
  {
    name: 'Pandanon',
    population: 2362,
    captain: 'Mesael L. Cabañero',
    coords: { lat: 10.05, lng: 124.12 },
  },
  {
    name: 'Poblacion',
    population: 2704,
    captain: 'Cydon Cariso M. Camacho II',
    coords: { lat: 10.1503, lng: 124.1546 },
  },
  {
    name: 'Saguise',
    population: 1977,
    captain: 'Nelson Q. Malacat',
    coords: { lat: 10.1378, lng: 124.1527 },
  },
  {
    name: 'Salog',
    population: 1313,
    captain: 'Gregoria E. Pogoy',
    coords: { lat: 10.1344, lng: 124.18 },
  },
  {
    name: 'San Jose',
    population: 1813,
    captain: 'Rolando C. Pogoy',
    coords: { lat: 10.144, lng: 124.1954 },
  },
  {
    name: 'Santo Niño',
    population: 754,
    captain: 'Gregorio T. Bemil',
    coords: { lat: 10.1158, lng: 124.1685 },
  },
  {
    name: 'Taytay',
    population: 1667,
    captain: 'Moises T. Lambojon',
    coords: { lat: 10.1405, lng: 124.1669 },
  },
  {
    name: 'Tugas',
    population: 979,
    captain: 'Rufina P. Suello',
    coords: { lat: 10.1334, lng: 124.143 },
  },
  {
    name: 'Tulang',
    population: 2115,
    captain: 'Raque P. Pacaldo',
    coords: { lat: 10.1498, lng: 124.2076 },
  },
]

export const getBarangayId = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const barangays = barangayData.map(
  ({ name, population, captain, coords, heroImage }) => ({
    id: getBarangayId(name),
    name,
    population,
    captain,
    coords,
    heroImage,
    description: null,
    lastUpdated: '2020 Census',
  })
)
