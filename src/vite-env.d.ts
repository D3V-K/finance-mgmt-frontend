/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_USER_POOL_ID: string
  readonly VITE_USER_POOL_CLIENT_ID: string
  readonly VITE_AWS_REGION: string
  /** Comma-separated ledger features this deployment supports, or "all". Empty means legacy-only. */
  readonly VITE_LEDGER_FEATURES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
