# Holmes Agent Portal — React App

A standalone React portal built from the Stacker source code, with all
`@stacker/portal-sdk` dependencies replaced by direct HubSpot REST API calls.

## What this replaces
- `PortalSDK.useCurrentUser()` → custom `AuthProvider` + `useAuth()`
- `PortalSDK.useRecords()` → `fetchDeals()` via HubSpot Search API
- `PortalSDK.useRecord()` → `fetchDeal()` via HubSpot CRM API
- `PortalSDK.useRouter()` → React Router v6
- `PortalSDK.createRecord()` → HubSpot API POST
- `PortalSDK.getSelectLabel()` → static stage maps in `hubspot.ts`
- `@workspace/ui` components → plain Tailwind CSS

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Edit `.env` and add:
- `VITE_HUBSPOT_TOKEN` — your HubSpot Private App token
- `VITE_PIPELINE_ID` — your Australia Admissions Pipeline ID

### 3. Run locally
```bash
npm run dev
```
Opens at http://localhost:3000

### 4. Build for production
```bash
npm run build
```
Output in `/dist` — deploy to AWS, Netlify, or any static host.

## Project Structure
```
src/
  lib/
    hubspot.ts     — All HubSpot API calls (replaces PortalSDK data layer)
    auth.tsx       — Authentication context (replaces PortalSDK auth)
    utils.ts       — Date formatting, badge classes, initials
  components/
    AuroraBackground.tsx  — WebGL aurora effect (exact copy from Stacker)
    Header.tsx            — Navigation bar
    Layout.tsx            — Layout, Footer, PageContainer
  pages/
    LoginPage.tsx              — Login with email (aurora background)
    HomePage.tsx               — Dashboard with stats, quick actions, activity
    ApplicationsPage.tsx       — Filterable, sortable, paginated applications table
    ApplicationDetailPage.tsx  — Full student detail with tabs and timeline
    OtherPages.tsx             — Settings, 404
  App.tsx     — Routing and auth guards
  main.tsx    — Entry point
```

## Authentication
Currently uses localStorage to persist the logged-in user. The login flow
looks up the email in HubSpot Contacts and logs in if found.

For production, replace with a proper backend auth service (JWT, magic links,
or SSO). The `AuthProvider` in `auth.tsx` is designed to be swapped easily.

## Deployment to AWS
1. Run `npm run build`
2. Upload the `/dist` folder to an S3 bucket
3. Enable static website hosting
4. Point CloudFront at the S3 bucket
5. Set environment variables via CloudFront Functions or a backend config endpoint

## Notes
- The HubSpot token is embedded in the frontend build. For production,
  proxy all HubSpot API calls through a backend server so the token
  is never exposed to the browser.
- The Vite dev server includes a proxy config to avoid CORS issues locally.
