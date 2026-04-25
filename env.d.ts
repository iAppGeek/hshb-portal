namespace NodeJS {
  interface ProcessEnv {
    AUTH_URL?: string
    AUTH_SECRET: string
    AZURE_AD_CLIENT_ID: string
    AZURE_AD_CLIENT_SECRET: string
    AZURE_AD_TENANT_ID: string
    NEXT_PUBLIC_SUPABASE_URL: string
    SUPABASE_SERVICE_ROLE_KEY: string
    NEXT_PUBLIC_GA_ID: string
    E2E_TEST?: string
    E2E_TEST_SECRET?: string
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: string
    VAPID_PRIVATE_KEY: string
    VAPID_SUBJECT: string
  }
}
