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
├── api/
│   ├── client.ts           # Axios instance with auth interceptor
│   ├── transactions.ts     # Transaction CRUD endpoints
│   ├── categories.ts       # Category management endpoints
│   └── reports.ts          # Aggregation and reporting endpoints
│
├── components/
│   ├── ui/                 # Generic reusable components (Button, Input, Modal)
│   ├── layout/             # AppShell, Sidebar, Header, PageWrapper
│   ├── transactions/       # TransactionList, TransactionForm, TransactionRow
│   ├── categories/         # CategoryTree, CategoryBadge, CategoryForm
│   └── reports/            # MonthlyChart, CategoryBreakdown, NetWorthTrend
│
├── hooks/
│   ├── useAuth.ts          # Cognito sign-in, sign-out, session state
│   ├── useTransactions.ts  # TanStack Query hooks for transaction data
│   ├── useCategories.ts    # TanStack Query hooks for category data
│   └── useReports.ts       # TanStack Query hooks for report/aggregation data
│
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── TransactionsPage.tsx
│   ├── CategoriesPage.tsx
│   └── ReportsPage.tsx
│
├── store/
│   └── uiStore.ts          # Zustand store for UI-only state (sidebar, modals)
│
├── types/
│   ├── transaction.ts
│   ├── category.ts
│   └── report.ts
│
├── utils/
│   ├── currency.ts         # JPY/other currency formatting helpers
│   └── dates.ts            # Date range helpers for report queries
│
├── main.tsx                # App entry point, Amplify config, QueryClient setup
├── App.tsx                 # Router setup, auth guard
└── vite.config.ts
```

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
| Routing | React Router v6 | Client-side SPA routing |
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

All API calls are made through a shared Axios instance defined in `api/client.ts`. The instance automatically attaches the current Cognito ID token to every request and handles 401 responses by redirecting to `/login`.

```typescript
// api/client.ts
import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

api.interceptors.request.use(async (config) => {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) window.location.href = '/login'
    return Promise.reject(err)
  }
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

Create a `.env.local` file for local development. These values are injected at build time by Vite and embedded in the static bundle — do not store secrets here.

```bash
# .env.local
VITE_API_BASE_URL=https://your-api-id.execute-api.ap-northeast-1.amazonaws.com/prod
VITE_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=ap-northeast-1
```

In production these are set as environment variables in the GitHub Actions deploy workflow and substituted into the build at CI time — they are never committed to the repository.

---

## Local Development

**Prerequisites**: Node.js 20+, npm 10+

```bash
# Install dependencies
npm install

# Start dev server with hot module replacement
npm run dev
# → http://localhost:5173

# Type checking
npm run typecheck

# Linting
npm run lint
```

The Vite dev server proxies `/api/*` requests to the deployed API Gateway URL to avoid CORS issues locally. This is configured in `vite.config.ts`:

```typescript
// vite.config.ts (proxy section)
server: {
  proxy: {
    '/api': {
      target: process.env.VITE_API_BASE_URL,
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

Deployment is automated via GitHub Actions on every push to `main`.

```yaml
# .github/workflows/deploy-frontend.yml
name: Deploy frontend

on:
  push:
    branches: [main]
    paths: ['frontend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run typecheck

      - run: npm run build
        env:
          VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
          VITE_USER_POOL_ID: ${{ secrets.VITE_USER_POOL_ID }}
          VITE_USER_POOL_CLIENT_ID: ${{ secrets.VITE_USER_POOL_CLIENT_ID }}
          VITE_AWS_REGION: ${{ secrets.VITE_AWS_REGION }}

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-1

      - name: Sync to S3
        run: aws s3 sync dist/ s3://${{ secrets.S3_BUCKET }} --delete

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} \
            --paths "/*"
```

The workflow only runs when files inside the `frontend/` directory change, so backend-only commits do not trigger a frontend redeploy.

---

## Related

- [`/backend`](../backend/README.md) — Python Lambda + FastAPI backend
- [`/infra`](../infra/README.md) — AWS SAM / Terraform infrastructure definitions