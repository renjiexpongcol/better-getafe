# Better Getafe

<<<<<<< HEAD
<img width="1024" height="572" alt="image" src="https://github.com/user-attachments/assets/270f54cf-7398-4c68-95c9-1ac4c80cc071" />

=======
## Local News CMS

The News & Updates section is now managed by the local CMS at `/admin`. Start the full application with `npm run build` followed by `npm start`; this serves both the website and CMS API. For front-end-only work, run `npm run dev` and use `npm start` in another terminal for the CMS API (port 8080), or configure a Vite proxy.

Copy `.env.example` to `.env` and change both CMS values before deployment. The first start creates `data/cms.json` with categories and sample articles. Local development credentials are `admin@getafe.gov.ph` and `ChangeMe123!`. The generated data file and uploaded media are intentionally local and should not be committed.

The API provides public `GET /api/news`, `GET /api/news/:slug`, and `GET /api/categories`; management requests require the CMS bearer token. Admin endpoints support article, category, and media CRUD.
>>>>>>> 7b3e219 (Add CMS for News & Updates)

**Better Getafe** is a modern digital government portal for the **Municipality of Getafe, Bohol, Philippines**, designed to provide residents, visitors, businesses, and the wider community with centralized access to municipal information and digital services.

The platform brings important local information into a single, accessible, responsive web experience — including municipal information, announcements, barangay information, tourism, public services, community resources, and other essential government content.

---

## Overview

The goal of Better Getafe is to provide a reliable and user-friendly digital presence for the Municipality of Getafe.

Instead of requiring residents and visitors to search across different platforms or pages for municipal information, the portal provides a centralized experience where users can discover relevant information quickly.

### Key objectives

* Provide a modern and accessible municipal web portal
* Centralize important municipal information
* Improve access to public services and resources
* Provide information about Getafe's barangays and communities
* Promote local tourism and destinations
* Publish municipal announcements and updates
* Provide residents with useful contact and reference information
* Provide visitors with information about Getafe
* Create a responsive experience across desktop, tablet, and mobile devices
* Establish a scalable foundation for future digital government services

---

## Features

### 🏛️ Municipal Information

Centralized information about the Municipality of Getafe, including:

* Municipal overview
* History and background
* Local government information
* Municipal officials
* Government offices
* Contact information
* Public resources
* Other municipality-related information

### 📢 Announcements & Updates

A centralized location for municipal announcements and important community updates.

Potential content includes:

* Government announcements
* Public advisories
* Community notices
* Events
* Programs
* Important reminders
* Municipal updates

### 🏘️ Barangays

The portal provides information about the **24 barangays of Getafe**.

The barangay section is designed to allow users to:

* Browse all barangays
* View barangay information
* Learn about individual communities
* Access relevant local information
* Navigate between barangays without leaving the main portal experience

### 🌴 Tourism

A dedicated area for discovering Getafe and its local attractions.

Tourism content can include:

* Tourist destinations
* Natural attractions
* Local landmarks
* Activities
* Places to visit
* Local culture
* Travel information
* Community attractions

### 🏢 Government Services

A centralized entry point for information about municipal services and government resources.

The platform is designed to support the future expansion of digital services such as:

* Service directories
* Government office information
* Requirements
* Procedures
* Contact information
* Forms and documents
* Online service integrations

### 📱 Responsive Design

Better Getafe is designed to work across different screen sizes:

* Desktop computers
* Laptops
* Tablets
* Mobile phones

The interface prioritizes readability, accessibility, and straightforward navigation.

### 🔗 Structured Navigation

The portal uses structured URLs so pages can be directly accessed and shared.

Example:

```text
https://getafe.supra-intra.org/
https://getafe.supra-intra.org/about
https://getafe.supra-intra.org/barangays
https://getafe.supra-intra.org/tourism
```

The routing structure is intended to remain predictable as the platform grows.

---

# Technology Stack

Better Getafe is built using modern web technologies.

| Technology        | Purpose                                     |
| ----------------- | ------------------------------------------- |
| React             | User interface                              |
| Vite              | Development server and build tooling        |
| JavaScript / JSX  | Application development                     |
| CSS               | Styling and responsive design               |
| React Router      | Client-side navigation                      |
| Cloudflare Tunnel | Secure external access / deployment routing |

Additional libraries and integrations may be introduced as the platform evolves.

---

# Project Structure

The project follows a component-based React architecture.

A typical structure is:

```text
better-getafe/
│
├── public/
│   ├── assets/
│   └── ...
│
├── src/
│   ├── components/
│   │   ├── ...
│   │   └── shared/
│   │
│   ├── context/
│   │   └── ...
│   │
│   ├── data/
│   │   └── ...
│   │
│   ├── hooks/
│   │   └── ...
│   │
│   ├── pages/
│   │   ├── ...
│   │   └── ...
│   │
│   ├── App.jsx
│   ├── index.css
│   ├── main.jsx
│   ├── routes.js
│   └── setupFavicon.js
│
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

> The structure may change as the application develops. New features should follow the existing architectural conventions rather than introducing unnecessary parallel structures.

---

# Getting Started

## Prerequisites

Before running the project locally, make sure you have:

* Node.js
* npm
* Git

Check your installed versions:

```bash
node --version
npm --version
git --version
```

A current LTS version of Node.js is recommended.

---

# Installation

Clone the repository:

```bash
git clone <repository-url>
```

Enter the project directory:

```bash
cd better-getafe
```

Install dependencies:

```bash
npm install
```

---

# Development

Start the Vite development server:

```bash
npm run dev
```

To make the development server accessible from other devices on the network:

```bash
npm run dev -- --host 0.0.0.0
```

Vite will normally provide a local address similar to:

```text
http://localhost:5173
```

---

# Production Build

Create an optimized production build:

```bash
npm run build
```

The generated files will be placed in:

```text
dist/
```

Preview the production build locally:

```bash
npm run preview
```

---

# Development Through Cloudflare Tunnel

Better Getafe can be exposed through a Cloudflare Tunnel during development or testing.

The configured hostname is:

```text
getafe.supra-intra.org
```

The tunnel can be started with:

```bash
cloudflared tunnel run 499b4b42-7a3c-4187-adc6-babd08c86c41
```

The DNS route can be configured with:

```bash
cloudflared tunnel route dns 499b4b42-7a3c-4187-adc6-babd08c86c41 getafe.supra-intra.org
```

The Vite development server must also allow the hostname.

Example:

```js
server: {
  allowedHosts: ['getafe.supra-intra.org'],

  proxy: {
    '/psa': {
      target: 'https://openstat.psa.gov.ph:443',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/psa/, ''),
    },
  },
},
```

> Do not commit Cloudflare credentials, tunnel credentials, API tokens, or other private infrastructure secrets to the repository.

---

# Environment Variables

Environment-specific configuration should be stored outside the source code.

For local development, environment files can be created using:

```text
.env
.env.local
.env.development.local
```

Do not commit private environment files.

Example:

```env
VITE_API_URL=http://localhost:3000
```

Only variables intended to be exposed to the browser should use the `VITE_` prefix.

**Never place secrets in `VITE_*` variables**, because Vite exposes these values to client-side code.

---

# Configuration

## Vite

Vite configuration is located in:

```text
vite.config.js
```

The configuration is responsible for development-server behavior and integrations such as API proxying.

For example, the PSA OpenSTAT integration uses:

```text
/psa/*
```

to proxy requests through the development server.

This allows the browser to communicate with the application through a same-origin path while the development server forwards the request to the external PSA endpoint.

---

# Application Architecture

Better Getafe follows a reusable component-oriented approach.

## Components

Reusable UI elements should be placed inside:

```text
src/components/
```

Examples include:

* Header
* Footer
* Navigation
* Cards
* Modals
* Buttons
* Content sections
* Information panels
* Shared layout components

Reusable components should be preferred over duplicating UI across individual pages.

---

## Pages

Page-level views belong inside:

```text
src/pages/
```

Pages should primarily compose reusable components and provide page-specific content or behavior.

---

## Context

Application-wide React state or providers should be placed inside:

```text
src/context/
```

Only state that genuinely needs application-wide access should be promoted to global context.

---

## Hooks

Reusable React hooks belong inside:

```text
src/hooks/
```

Hooks should encapsulate reusable application behavior instead of duplicating the same logic across multiple pages.

---

## Data

Static application data can be organized inside:

```text
src/data/
```

Examples include:

* Barangay information
* Navigation configuration
* Municipal information
* Tourism content
* Static directories

Sensitive or private information should never be stored in client-side source files.

---

# Routing

Routes are centralized through:

```text
src/routes.js
```

Routes should use readable, predictable URLs.

Example:

```text
/
├── /about
├── /barangays
├── /tourism
├── /services
├── /announcements
└── /contact
```

When adding a new page:

1. Create the page component.
2. Add the route.
3. Add the appropriate navigation entry if required.
4. Verify direct URL access.
5. Verify browser refresh behavior.
6. Verify mobile navigation.
7. Verify that unknown routes have an appropriate fallback.

---

# Shared UI Principles

Better Getafe should maintain a consistent visual and interaction system throughout the application.

### Reuse existing components

Before creating a new component, check whether an existing shared component can be reused.

### Avoid duplicated layouts

Global elements such as the:

* Header
* Footer
* Navigation
* Page container
* Common buttons
* Common cards

should have a single reusable implementation whenever possible.

### Consistent spacing

Pages should follow the application's established spacing and layout system rather than introducing arbitrary values for every section.

### Responsive behavior

Every new feature should be tested on:

* Mobile
* Tablet
* Desktop

### Accessibility

Interactive elements should provide:

* Keyboard accessibility
* Appropriate labels
* Sufficient contrast
* Semantic HTML
* Visible focus states
* Meaningful alternative text for images

---

# Content Management

Municipal information should be structured so that content can be updated without unnecessarily changing the application's layout or component architecture.

When possible, separate:

```text
Content
```

from:

```text
Presentation
```

For example, barangay information should be represented as structured data rather than duplicated markup for every barangay.

This makes future migration to an API, CMS, or administrative system significantly easier.

---

# Security

Security is an important requirement for a government-facing platform.

The following rules should be followed:

* Never commit API keys.
* Never commit passwords.
* Never commit Cloudflare credentials.
* Never commit private certificates.
* Never commit production database files.
* Never expose private backend credentials through `VITE_*` variables.
* Validate external input.
* Sanitize user-generated content.
* Avoid rendering untrusted HTML.
* Keep dependencies updated.
* Use HTTPS for production access.
* Restrict administrative functionality appropriately.
* Do not place sensitive information in client-side code.

---

# Git & Repository Guidelines

The repository should contain source code and configuration required to build the application.

The following should generally **not** be committed:

```text
node_modules/
dist/
.env
.env.local
*.log
*.sqlite
*.db
```

These are covered by the project's `.gitignore`.

Before committing:

```bash
git status
```

Review the files being added.

Then:

```bash
git add .
git commit -m "Describe your change"
git push
```

Use clear commit messages that describe the change.

Examples:

```text
feat: add barangay information section
fix: resolve mobile navigation issue
refactor: consolidate shared footer
style: improve tourism cards
docs: update project documentation
```

---

# Recommended Development Workflow

When implementing a new feature:

### 1. Understand the existing structure

Check existing:

* Components
* Pages
* Routes
* Context
* Hooks
* Data structures

### 2. Reuse before creating

Look for an existing component that can be extended or reused.

### 3. Implement the feature

Keep the implementation focused and avoid unrelated changes.

### 4. Test locally

Run:

```bash
npm run dev
```

### 5. Test the production build

Run:

```bash
npm run build
```

### 6. Check responsive layouts

Verify the feature on multiple screen sizes.

### 7. Check navigation

Test:

* Internal links
* Browser back/forward
* Direct URL navigation
* Page refresh
* Unknown routes

### 8. Review the Git diff

Run:

```bash
git diff
```

Ensure no unintended files or secrets are included.

---

# Performance Considerations

The portal should remain fast even as more municipal content is added.

Recommended practices include:

* Optimize images before adding them
* Use appropriate image formats
* Avoid unnecessarily large assets
* Lazy-load large content where appropriate
* Avoid unnecessary dependencies
* Reuse components
* Avoid unnecessary React re-renders
* Keep bundles manageable
* Prefer static content when dynamic functionality is not required

---

# SEO & Discoverability

As a public-facing government portal, search engine discoverability is important.

Pages should have:

* Meaningful page titles
* Appropriate descriptions
* Semantic HTML
* Descriptive headings
* Accessible links
* Descriptive image alt text
* Clean URLs

The application should use human-readable browser titles such as:

```text
Getafe | Home
Getafe | Barangays
Getafe | Tourism
Getafe | Municipal Services
```

rather than generic titles for every page.

---

# Future Development

Better Getafe is designed as a foundation that can grow beyond a static information portal.

Potential future capabilities include:

### Digital Government Services

* Online application services
* Request tracking
* Digital forms
* Document requests
* Appointment systems
* Service status tracking

### Citizen Services

* Community reporting
* Feedback forms
* Public concerns
* Notifications
* Emergency information

### Municipal Administration

* Content management
* Announcement management
* Barangay management
* Tourism content management
* Service directory management

### Integrations

Potential integrations may include:

* Government APIs
* Open data sources
* Mapping services
* Notification services
* Analytics
* Authentication
* Municipal back-office systems

---

# Project Status

**Status:** Active Development

Better Getafe is currently under active development. Features, content, architecture, and integrations may change as the platform evolves.

Production readiness should be evaluated separately from development functionality.

---

# Contributing

Contributions and improvements should follow the project's existing architecture and design conventions.

Before submitting a change:

1. Ensure the application builds successfully.
2. Test the affected functionality.
3. Check responsive behavior.
4. Check for console errors.
5. Avoid unnecessary dependencies.
6. Avoid duplicating existing components.
7. Do not commit secrets or private data.
8. Keep commits focused and descriptive.

---

# License

This project currently does not specify an open-source license.

Unless a license is added by the project owner, the source code should be treated as **all rights reserved**.

Permission to use, copy, modify, distribute, or deploy the source code should not be assumed.

---

# Project Identity

**Project:** Better Getafe
**Repository:** `better-getafe`
**Purpose:** Municipal digital government portal
**Location:** Getafe, Bohol, Philippines
**Primary Domain:** `getafe.supra-intra.org`

---

## Vision

Better Getafe aims to provide a clear, accessible, and modern digital gateway to the Municipality of Getafe.

The long-term vision is to evolve the portal from an information website into a centralized digital platform that makes municipal information and government services easier to discover and access for residents, visitors, businesses, and the wider Getafe community.

> **Better information. Better access. Better Getafe.**

```
```
