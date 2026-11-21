import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PUBLIC_MENUS, buildPublicHeaderMenus, groupPublicHeaderMenuItems } from '../src/components/headerNavigation.js'

const item = (name, url) => ({ name, url, description: name, icon: 'Info' })

test('combines related public menus and removes repeated destinations', () => {
  const menus = buildPublicHeaderMenus([
    { key: 'services', label: 'Services', items: [item('Engineering', '/departments/engineering')] },
    { key: 'business', label: 'Business', items: [item('New business', '/services/e-services/new-business')] },
    { key: 'residents', label: 'Residents', items: [item('Citizen services', '/services'), item('Accessibility', '/accessibility'), item('Hotlines', '/services/hotlines')] },
    { key: 'information', label: 'Information', items: [item('About', '/info/about'), item('Tourism', '/tourism'), item('Events', '/events'), item('News', '/news'), item('History', '/info/history'), item('Hotlines', '/services/hotlines')] },
  ])

  assert.deepEqual(menus.map(menu => menu.key), ['services', 'discover', 'municipality'])
  assert.deepEqual(menus.map(menu => menu.label), ['Services', 'Discover', 'Municipality'])
  const urls = key => menus.find(menu => menu.key === key).items.map(entry => entry.url)
  assert.ok(urls('services').includes('/services/e-services/new-business'))
  assert.equal(urls('services').filter(url => url === '/services/hotlines').length, 1)
  assert.ok(urls('discover').includes('/tourism'))
  assert.ok(urls('discover').includes('/events'))
  assert.ok(urls('municipality').includes('/accessibility'))
  assert.ok(urls('municipality').includes('/info/history'))
  assert.ok(!urls('municipality').includes('/tourism'))
  assert.ok(!urls('municipality').includes('/news'))
})

test('keeps configured custom menus that do not overlap the canonical groups', () => {
  const menus = buildPublicHeaderMenus([{ key: 'culture', label: 'Culture', items: [item('Museum', '/culture/museum')] }])
  assert.deepEqual(menus.map(menu => menu.key), ['services', 'discover', 'municipality', 'culture'])
  assert.equal(menus.at(-1).items[0].url, '/culture/museum')
})

test('groups services into resident, office, and business sections without losing destinations', () => {
  const items = [
    item('Service directory', '/services/directory'),
    item('Civil Registry Certificates', '/services/certificates'),
    item('Emergency hotlines', '/services/hotlines'),
    item('Executive', '/departments/executive'),
    item('Engineering', '/departments/engineering'),
    item('Business Online Billing', '/services/e-services/business-billing'),
    item('New Business Application', '/services/e-services/new-business-application'),
  ]
  const sections = groupPublicHeaderMenuItems('services', items)

  assert.deepEqual(sections.map(section => section.label), ['Resident services', 'Municipal offices', 'Business & payments'])
  assert.deepEqual(sections.map(section => section.items.length), [3, 2, 2])
  assert.deepEqual(sections.flatMap(section => section.items.map(entry => entry.url)).sort(), items.map(entry => entry.url).sort())
})

test('includes official National ID resources in a dedicated Services group', () => {
  const services = DEFAULT_PUBLIC_MENUS.find(menu => menu.key === 'services')
  const nationalId = groupPublicHeaderMenuItems('services', services.items)
    .find(section => section.key === 'national-id')

  assert.ok(nationalId)
  assert.deepEqual(nationalId.items.map(entry => entry.name), [
    'Access your Digital National ID',
    'Frequently Asked Questions',
    'Registration Centers',
    'Use Case Bulletin',
    'Philippine Digital National Identity Project',
  ])
  assert.ok(nationalId.items.every(entry => entry.url.startsWith('https://')))
})

test('keeps every canonical dropdown populated and preserves its destinations', () => {
  for (const menu of DEFAULT_PUBLIC_MENUS) {
    const sections = groupPublicHeaderMenuItems(menu.key, menu.items)
    assert.ok(sections.length > 0, `${menu.key} has a dropdown section`)
    assert.ok(sections.flatMap(section => section.items).length === menu.items.length, `${menu.key} destinations are preserved`)
  }
})
