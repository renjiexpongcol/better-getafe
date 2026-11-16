// Demographic & statistical profile of the Municipality of Getafe, Bohol.
// Sources: Philippine Statistics Authority (population/households), COMELEc (voters),
// Bureau of Local Government Finance (income), Philippine Postal Corporation (postal).

export const overview = {
  type: 'municipality',
  islandGroup: 'Visayas',
  region: 'Central Visayas (Region VII)',
  province: 'Bohol',
  postalCode: '6334',
  coastal: true,
  marineWaterbodies: 'Tañon Strait, Visayan Sea',
  majorIslands: 'Bohol',
  landAreaKm2: 179.17,
  landAreaSqMi: 69.18,
  landAreaShareBohol: '3.75%',
  population2020: 33422,
  population2015: 30955,
  populationShareBohol: '2.40%',
  populationShareRegion: '0.41%',
  densityPerKm2: 187,
  densityPerSqMi: 483,
  barangayCount: 24,
  coordinates: "10° 9' N, 124° 9' E",
  coordinatesDecimal: { lat: 10.1496, lng: 124.1534 },
  elevationM: 5.1,
  elevationFt: 16.6,
  voters2019: 20739,
  votersMale2019: 10421,
  votersFemale2019: 10318,
  income2016: 90971295.81,
};

export const barangayStats = [
  { name: 'Alumar', pop2020: 1203, pop2015: 1164, change: '3.35%', growth: '0.70%' },
  { name: 'Banacon', pop2020: 1524, pop2015: 1298, change: '17.41%', growth: '3.44%' },
  { name: 'Buyog', pop2020: 973, pop2015: 906, change: '7.40%', growth: '1.51%' },
  { name: 'Cabasakan', pop2020: 1287, pop2015: 1179, change: '9.16%', growth: '1.86%' },
  { name: 'Campao Occidental', pop2020: 535, pop2015: 484, change: '10.54%', growth: '2.13%' },
  { name: 'Campao Oriental', pop2020: 1037, pop2015: 1034, change: '0.29%', growth: '0.06%' },
  { name: 'Cangmundo', pop2020: 934, pop2015: 972, change: '-3.91%', growth: '-0.84%' },
  { name: 'Carlos P. Garcia', pop2020: 1023, pop2015: 994, change: '2.92%', growth: '0.61%' },
  { name: 'Corte Baud', pop2020: 1045, pop2015: 868, change: '20.39%', growth: '3.98%' },
  { name: 'Handumon', pop2020: 1269, pop2015: 1172, change: '8.28%', growth: '1.69%' },
  { name: 'Jagoliao', pop2020: 1416, pop2015: 1353, change: '4.66%', growth: '0.96%' },
  { name: 'Jandayan Norte', pop2020: 1052, pop2015: 963, change: '9.24%', growth: '1.88%' },
  { name: 'Jandayan Sur', pop2020: 1718, pop2015: 1538, change: '11.70%', growth: '2.36%' },
  { name: 'Mahanay', pop2020: 607, pop2015: 538, change: '12.83%', growth: '2.57%' },
  { name: 'Nasingin', pop2020: 2115, pop2015: 2045, change: '3.42%', growth: '0.71%' },
  { name: 'Pandanon', pop2020: 2362, pop2015: 2228, change: '6.01%', growth: '1.24%' },
  { name: 'Poblacion', pop2020: 2704, pop2015: 2695, change: '0.33%', growth: '0.07%' },
  { name: 'Saguise', pop2020: 1977, pop2015: 1652, change: '19.67%', growth: '3.85%' },
  { name: 'Salog', pop2020: 1313, pop2015: 1195, change: '9.87%', growth: '2.00%' },
  { name: 'San Jose', pop2020: 1813, pop2015: 1729, change: '4.86%', growth: '1.00%' },
  { name: 'Santo Niño', pop2020: 754, pop2015: 768, change: '-1.82%', growth: '-0.39%' },
  { name: 'Taytay', pop2020: 1667, pop2015: 1536, change: '8.53%', growth: '1.74%' },
  { name: 'Tugas', pop2020: 979, pop2015: 886, change: '10.50%', growth: '2.12%' },
  { name: 'Tulang', pop2020: 2115, pop2015: 1758, change: '20.31%', growth: '3.97%' },
];

export const barangayTotals = { pop2020: 33422, pop2015: 30955, change: '7.97%', growth: '1.63%' };

export const incomeData = [
  { year: 2009, income: 51433160.4, change: null },
  { year: 2010, income: 54275975.19, change: '5.53%' },
  { year: 2011, income: 59345647.68, change: '9.34%' },
  { year: 2012, income: 58922767.06, change: '-0.71%' },
  { year: 2013, income: 64333825.62, change: '9.18%' },
  { year: 2014, income: 72669802.18, change: '12.96%' },
  { year: 2015, income: 84345499.33, change: '16.07%' },
  { year: 2016, income: 90971295.81, change: '7.86%' },
];

export const householdData = [
  { census: '1990 May 1', population: 21131, households: 3825, size: 5.52 },
  { census: '1995 Sep 1', population: 23923, households: 4179, size: 5.72 },
  { census: '2000 May 1', population: 26823, households: 4694, size: 5.71 },
  { census: '2007 Aug 1', population: 27852, households: 5230, size: 5.33 },
  { census: '2010 May 1', population: 27778, households: 5667, size: 4.9 },
  { census: '2015 Aug 1', population: 30955, households: 6487, size: 4.77 },
];

export const ageData = [
  { group: 'Under 1', population: 699, pct: '2.26%' },
  { group: '1 to 4', population: 2968, pct: '9.59%' },
  { group: '5 to 9', population: 3780, pct: '12.21%' },
  { group: '10 to 14', population: 3774, pct: '12.19%' },
  { group: '15 to 19', population: 3212, pct: '10.38%' },
  { group: '20 to 24', population: 2779, pct: '8.98%' },
  { group: '25 to 29', population: 2317, pct: '7.49%' },
  { group: '30 to 34', population: 2004, pct: '6.47%' },
  { group: '35 to 39', population: 1789, pct: '5.78%' },
  { group: '40 to 44', population: 1529, pct: '4.94%' },
  { group: '45 to 49', population: 1359, pct: '4.39%' },
  { group: '50 to 54', population: 1237, pct: '4.00%' },
  { group: '55 to 59', population: 1098, pct: '3.55%' },
  { group: '60 to 64', population: 842, pct: '2.72%' },
  { group: '65 to 69', population: 628, pct: '2.03%' },
  { group: '70 to 74', population: 423, pct: '1.37%' },
  { group: '75 to 79', population: 275, pct: '0.89%' },
  { group: '80 and over', population: 242, pct: '0.78%' },
];

export const ageGroupSummary = {
  youngDependents: { pct: '36.25%', count: 11221, label: '14 and below' },
  economicallyActive: { pct: '58.69%', count: 18166, label: '15 to 64' },
  seniorCitizens: { pct: '5.07%', count: 1568, label: '65 and over' },
  youthDependencyRatio: 61.77,
  oldAgeDependencyRatio: 8.63,
  totalDependencyRatio: 70.4,
  medianAge: 21.88,
};

export const historicalPopulation = [
  { census: '1903 Mar 2', population: 4331, change: null, growth: null },
  { census: '1918 Dec 31', population: 6643, change: '+2,312', growth: '2.74%' },
  { census: '1939 Jan 1', population: 12384, change: '+5,741', growth: '3.16%' },
  { census: '1948 Oct 1', population: 15804, change: '+3,420', growth: '2.53%' },
  { census: '1960 Feb 15', population: 12177, change: '-3,627', growth: '-2.27%' },
  { census: '1970 May 6', population: 14338, change: '+2,161', growth: '1.61%' },
  { census: '1975 May 11', population: 15903, change: '+1,565', growth: '2.10%' },
  { census: '1980 May 1', population: 16769, change: '+866', growth: '1.07%' },
  { census: '1990 May 1', population: 21135, change: '+4,366', growth: '2.34%' },
  { census: '1995 Sep 1', population: 23927, change: '+2,792', growth: '2.35%' },
  { census: '2000 May 1', population: 26826, change: '+2,899', growth: '2.48%' },
  { census: '2007 Aug 1', population: 27852, change: '+1,026', growth: '0.52%' },
  { census: '2010 May 1', population: 27788, change: '-64', growth: '-0.08%' },
  { census: '2015 Aug 1', population: 30955, change: '+3,167', growth: '2.08%' },
  { census: '2020 May 1', population: 33422, change: '+2,467', growth: '1.63%' },
];

export const nearestTowns = [
  { name: 'Buenavista, Bohol', km: '8.78', mi: '5.45', dir: 'South-Southwest', bearing: 'S30°W' },
  { name: 'Inabanga, Bohol', km: '16.22', mi: '10.08', dir: 'Southwest', bearing: 'S36°W' },
  { name: 'Talibon, Bohol', km: '18.78', mi: '11.67', dir: 'East', bearing: 'S90°E' },
  { name: 'Trinidad, Bohol', km: '22.31', mi: '13.86', dir: 'East-Southeast', bearing: 'S69°E' },
  { name: 'Danao, Bohol', km: '23.87', mi: '14.83', dir: 'South-Southeast', bearing: 'S18°E' },
  { name: 'Bien Unido, Bohol', km: '24.51', mi: '15.23', dir: 'East', bearing: 'S88°E' },
];

export const nearestCities = [
  { name: 'Lapu-Lapu', km: '28.60', mi: '17.77', dir: 'Northwest', bearing: 'N51°W' },
  { name: 'Mandaue', km: '30.11', mi: '18.71', dir: 'Northwest', bearing: 'N50°W' },
  { name: 'Cebu City', km: '31.79', mi: '19.75', dir: 'West-Northwest', bearing: 'N60°W' },
  { name: 'Talisay, Cebu', km: '35.15', mi: '21.84', dir: 'West-Northwest', bearing: 'N72°W' },
  { name: 'Danao, Cebu', km: '43.30', mi: '26.90', dir: 'North-Northwest', bearing: 'N19°W' },
  { name: 'Naga, Cebu', km: '43.75', mi: '27.18', dir: 'West', bearing: 'N81°W' },
];

export const manilaDistance = { km: '600.34', mi: '373.03', dir: 'Northwest', bearing: 'N35°W' };

export const proportionalShares = {
  population: [
    { label: 'Provincial share (Bohol)', share: '2.3970%', of: '1,394,329' },
    { label: 'Regional share (Central Visayas)', share: '0.4135%', of: '8,081,988' },
    { label: 'National share (Philippines)', share: '0.0307%', of: '109,035,343' },
  ],
  barangays: [
    { label: 'Provincial share (Bohol)', share: '2.1641%', of: '1,109 barangays' },
    { label: 'Regional share (Central Visayas)', share: '1.0381%', of: '2,312 barangays' },
    { label: 'National share (Philippines)', share: '0.0571%', of: '42,046 barangays' },
  ],
};

export const notes = [
  'Unless otherwise specified, population count (excluding percentages), household data, and land area figures are derived from the Philippine Statistics Authority.',
  'Data on registered voters is from the Commission on Elections.',
  'Data on annual regular income is from the Bureau of Local Government Finance, Department of Finance.',
  'Postal code information is from the Philippine Postal Corporation.',
];
