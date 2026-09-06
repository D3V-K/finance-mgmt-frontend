# Finance App — React Frontend

A personal finance management application built with React and TypeScript, deployed as a static site on AWS S3 + CloudFront. The frontend communicates with a serverless Python backend via AWS API Gateway and authenticates users through Amazon Cognito.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Authentication Flow](#authentication-flow)
- [API Communication](#api-communication)
- [State Management](#state-management)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Quality and Testing](#quality-and-testing)
- [Building and Deployment](#building-and-deployment)
- [CI/CD Pipeline](#cicd-pipeline)

---

## Overview

The frontend is a single-page application (SPA) built with React and Vite. It is served entirely as static assets from an S3 bucket, fronted by CloudFront for HTTPS, global edge caching, and proper SPA routing. All dynamic data is fetched at runtime from a REST API backed by AWS Lambda and Aurora PostgreSQL.

```
Browser
  └── CloudFront (HTTPS, CDN, SPA routing)
        └── S3 Bucket (React build artifacts)
              └── API Gateway (REST calls with JWT)
                    └── Lambda (Python / FastAPI)
                          └── Aurora PostgreSQL
```

---

## Cash and Bank ledger

The dashboard separates current Cash, Bank, and total balances from selected-month cash flow. Transactions require an explicit Cash or Bank account. Opening balances can be set or corrected at `/opening-balances`, including zero amounts and separate baseline dates. Transfers have their own create/delete history at `/transfers`; they do not count as income or expenses.

The frontend follows the sibling `finance-mgmt-backend-lite` contract: lowercase `cash`/`bank`, `GET /reports/balance`, `GET /opening-balances`, account-specific opening balance `PUT` requests, and paginated transfers. Net balance history retains `/reports/net-worth` and its `net_worth` response field for compatibility; user-facing labels say “Net balance.” Only returned values are plotted, with missing months represented as gaps.

Backend limitations: transaction account filtering is not exposed, so account filters and account drill-down links are omitted. The current history endpoint returns an empty series for opening balances without transactions; the frontend explains that empty state and does not manufacture baseline points. These backend behaviors must change before opening-only history can be displayed.

## Architecture

### Static Hosting (S3 + CloudFront)

The React app is compiled into a static `dist/` folder by Vite and synced to an S3 bucket. S3 itself is not exposed publicly — CloudFront sits in front as the sole entry point.

CloudFront is configured with:

- **HTTPS only** — required for Cognito hosted UI redirects and secure cookie handling
- **Custom error page** — 403 and 404 responses from S3 are rewritten to serve `index.html` with a 200 status, which is what enables client-side routing (React Router) to work correctly on hard refreshes and direct URL access
- **Cache invalidation** — a `/*` invalidation is triggered on every deployment so users always receive the latest build
- **Origin Access Control (OAC)** — CloudFront authenticates to S3 using OAC instead of a public bucket policy, keeping the bucket private

### Authentication (Amazon Cognito)

Authentication is handled by a Cognito User Pool. The app uses a custom-built login UI (not the Cognito hosted UI) via AWS Amplify JS. On successful sign-in, Cognito issues three tokens:

| Token | Purpose | Lifetime |
|---|---|---|
| ID Token (JWT) | Attached to every API request as `Authorization: Bearer` | 1 hour |
| Access Token | Used internally by Amplify for session management | 1 hour |
| Refresh Token | Silently refreshes the ID and Access tokens | 30 days |

Amplify handles token refresh automatically. The app only interacts with the ID token — it is extracted and attached to outgoing API requests via an Axios request interceptor.

### API Communication (API Gateway)

The React app communicates with a single base URL pointing to an API Gateway HTTP API (v2). All requests carry the Cognito ID Token in the `Authorization` header. API Gateway validates the JWT signature and claims against the Cognito User Pool before forwarding requests to Lambda — no custom auth logic is needed in the application code.

CORS is configured on API Gateway to allow requests from the CloudFront distribution origin. During local development, a Vite proxy is used to avoid CORS issues when hitting the deployed API directly.

---

## Project Structure

```
src/
├── api/                    # HTTP client and resource modules
├── components/
│   ├── ui/                 # Generic reusable components
│   ├── layout/             # Application chrome
│   ├── transactions/       # Transaction-specific components
│   ├── categories/         # Category-specific components
│   └── reports/            # Reporting components
├── hooks/                  # Shared and data-fetching hooks
├── pages/
│   └── HomePage.tsx        # Neutral foundation placeholder
├── store/                  # Zustand UI state
├── styles/                 # Tailwind entry point and global styles
├── test/                   # Shared test setup
├── types/                  # Domain types
├── utils/                  # Formatting and date helpers
├── App.test.tsx
├── App.tsx                 # Router setup
└── main.tsx                # Application providers and entry point
```

Vite, TypeScript, ESLint, PostCSS, and Tailwind configuration files live at the repository root. Feature files are added to the prepared directories as their issues are implemented.

---

## Tech Stack

| Concern | Library | Reason |
|---|---|---|
| Framework | React 18 + TypeScript | Component model, type safety |
| Build tool | Vite | Fast HMR, optimised production builds |
| Styling | Tailwind CSS | Utility-first, no runtime overhead |
| Auth | AWS Amplify JS v6 | Cognito integration, token refresh |
| Data fetching | TanStack Query v5 | Server state, caching, background refetch |
| HTTP client | Axios | Interceptors for JWT injection |
| Routing | React Router v7 | Client-side SPA routing |
| UI state | Zustand | Lightweight store for modals, sidebar |
| Charts | Recharts | Declarative charts for spending reports |
| Forms | React Hook Form + Zod | Performant forms with schema validation |

---

## Authentication Flow

```
1. User visits app
      │
      ├─ No session → redirect to /login
      │
2. User submits email + password
      │
      └─ Amplify.signIn() → Cognito User Pool
            │
            ├─ Success → stores tokens in memory (Amplify manages this)
            │             → redirect to /dashboard
            │
            └─ Failure → display error message

3. Every subsequent API call
      │
      └─ Axios interceptor calls fetchAuthSession()
            │
            └─ Returns current ID Token (refreshing silently if expired)
                  │
                  └─ Attaches as Authorization: Bearer <id_token>
```

The `useAuth` hook exposes `user`, `isAuthenticated`, `signIn`, and `signOut`. Route protection is implemented in `App.tsx` using a `<ProtectedRoute>` wrapper component that checks `isAuthenticated` before rendering the child page.

```typescript
// hooks/useAuth.ts
import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth'
import { useState, useEffect } from 'react'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  return { user, loading, isAuthenticated: !!user, signIn, signOut }
}
```

---

## API Communication

All API calls use the shared Axios instance in `src/api/client.ts`. It attaches the current Cognito ID token and normalizes failures into distinguishable `ApiError` kinds. A 401 is surfaced without an automatic retry or redirect, avoiding redirect loops.

```typescript
// api/client.ts
import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'
import { normalizeApiError } from './errors'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
})

api.interceptors.request.use(async (config) => {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(normalizeApiError(err))
)

export default api
```

Each resource (transactions, categories, reports) has its own module in `src/api/` that wraps the typed endpoint calls:

```typescript
// api/transactions.ts
import api from './client'
import type { Transaction, CreateTransactionDto } from '../types/transaction'

export const getTransactions = (params: { from: string; to: string }) =>
  api.get<Transaction[]>('/transactions', { params }).then(r => r.data)

export const createTransaction = (dto: CreateTransactionDto) =>
  api.post<Transaction>('/transactions', dto).then(r => r.data)

export const deleteTransaction = (id: string) =>
  api.delete(`/transactions/${id}`)
```

---

## State Management

The app separates server state from UI state:

**Server state** is managed by TanStack Query. It handles caching, background refetching, loading and error states, and cache invalidation after mutations.

```typescript
// hooks/useTransactions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTransactions, createTransaction } from '../api/transactions'

export function useTransactions(from: string, to: string) {
  return useQuery({
    queryKey: ['transactions', from, to],
    queryFn: () => getTransactions({ from, to }),
    staleTime: 1000 * 60 * 2,  // treat data as fresh for 2 minutes
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}
```

**UI state** (sidebar open/closed, active modal, selected filters) is managed by a lightweight Zustand store and never sent to the server.

---

## Environment Variables

Copy `.env.example` to `.env.local`. `VITE_*` values are embedded in the browser bundle and must not contain secrets. `API_PROXY_TARGET` is read only by Vite's local development server.

```bash
# .env.local
VITE_API_BASE_URL=/api
API_PROXY_TARGET=http://localhost:8000
VITE_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=ap-northeast-1
```

In production these are set as environment variables in the GitHub Actions deploy workflow and substituted into the build at CI time — they are never committed to the repository.

---

## Local Development

**Prerequisites**: Node.js 20+, npm 10+

```bash
# Install exact locked dependencies
npm ci

# Start dev server with hot module replacement
npm run dev
# → http://localhost:5173

# Type checking
npm run typecheck

# Linting
npm run lint

# Tests
npm test
```

## Quality and Testing

Run the complete local quality gate before opening a pull request:

```bash
npm run quality
```

The gate runs TypeScript checking, ESLint, the Vitest unit/component suite, and a
production build. Tests use React Testing Library and `user-event` for user-facing
behavior, MSW handlers in `src/test/` for deterministic backend responses, and
reusable Cognito fakes so they never require AWS credentials or a live API.

Automated `jest-axe` checks cover the login, dashboard, transactions, categories,
and reports pages plus the primary create dialogs. These checks catch many serious
accessibility regressions, but do not replace keyboard and screen-reader review.

The Playwright smoke suite covers the protected-route login redirect, primary
navigation, transaction account selection, opening balance setup, transfer creation/deletion, and balance history on a mobile viewport in Chromium. Install its browser once, then run:

```bash
npm run test:e2e:install
npm run test:e2e
```

Playwright starts Vite in the dedicated `e2e` mode, which substitutes an in-memory
session for Cognito while Playwright intercepts API calls. Never use that mode for
a deployed build. GitHub Actions runs both the quality gate and browser smoke
suite for pull requests and pushes to `main`.

The Vite dev server proxies `/api/*` requests to `API_PROXY_TARGET` and strips the `/api` prefix. For production builds, set `VITE_API_BASE_URL` to the deployed API URL.

```typescript
// vite.config.ts (proxy section)
server: {
  proxy: {
    '/api': {
      target: env.API_PROXY_TARGET,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, '')
    }
  }
}
```

---

## Building and Deployment

```bash
# Production build — outputs to dist/
npm run build

# Preview the production build locally
npm run preview
```

Deploying manually (requires AWS CLI configured):

```bash
# Sync build artifacts to S3
aws s3 sync dist/ s3://YOUR_BUCKET_NAME --delete

# Invalidate CloudFront cache so users get the new build immediately
aws cloudfront create-invalidation \
  --distribution-id YOUR_CF_DISTRIBUTION_ID \
  --paths "/*"
```

---

## CI/CD Pipeline

Deployment is automated by `.github/workflows/deploy-frontend.yml`. A successful
`Frontend quality` run on `main` builds the tested revision, assumes an AWS IAM
role through GitHub OIDC, syncs `dist/` to S3, and optionally invalidates
CloudFront. It can also be started manually with `workflow_dispatch`.

Create a GitHub environment named `production`, then configure:

| Type | Name | Purpose |
|---|---|---|
| Secret | `AWS_ROLE_TO_ASSUME` | ARN of the IAM role trusted by GitHub's OIDC provider |
| Variable | `AWS_REGION` | Region containing the S3 bucket |
| Variable | `S3_BUCKET` | Destination bucket name, without `s3://` |
| Variable (optional) | `CLOUDFRONT_DISTRIBUTION_ID` | Distribution to invalidate after upload |
| Variable | `VITE_API_BASE_URL` | Production API URL embedded in the bundle |
| Variable | `VITE_USER_POOL_ID` | Production Cognito user pool ID |
| Variable | `VITE_USER_POOL_CLIENT_ID` | Production Cognito app client ID |
| Variable | `VITE_AWS_REGION` | Cognito region; falls back to `AWS_REGION` |

The IAM role needs permission to list the bucket, upload and delete objects, and,
when configured, create CloudFront invalidations. Scope the role's GitHub OIDC
trust policy to this repository and the `production` environment. The Vite values
are repository/environment variables rather than secrets because Vite embeds them
in browser-delivered JavaScript; never put credentials in a `VITE_*` value.

The application lives at the repository root, so the workflow runs for changes in this repository.

---

## Repository root

This repository contains only the frontend. Run all npm commands from the repository root; `src/` is the application source and `dist/` is generated output.
