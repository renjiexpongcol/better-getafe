# Icon-only utility controls

Use `data-icon-button="ghost"` on native buttons and links that contain only an
action icon. The shared styles in `src/icon-buttons.css` load through the root
stylesheet and also apply inside portals and lazy-loaded interfaces.

```jsx
<button type="button" data-icon-button="ghost" aria-label="Close" onClick={onClose}>
  <X size={20} aria-hidden="true" />
</button>
```

Keep local classes for placement and icon sizing. The ghost variant removes
backgrounds, borders and shadows in every interaction state, supplies a minimum
44px hit target, and changes icon color on hover/press. The existing `focus.css`
policy supplies keyboard focus rings. Dark surfaces can set
`--icon-button-hover-color`, `--icon-button-active-color` and
`--icon-button-disabled-color` to match their palette.

Do not use this variant for labeled buttons, menu rows, navigation entries,
calendar dates, carousel dots, image previews, thumbnails or selection cards.
Those controls retain their own surfaces and selected-state indicators.

Run `node scripts/test-icon-buttons-ui.mjs` with the development server running.
Set `UI_TEST_URL` if the server uses a different address. The test audits JSX for
unconverted icon-only controls, loads every stylesheet to check the cascade,
checks interaction states and focus rings, and visits public, authentication,
resident, staff, CMS, media, settings, access and catalog pages at desktop and
mobile sizes. API responses are browser fixtures; no stored records are changed.
