/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** local (padrão) ou supabase. Ver supabase/README.md. */
  readonly VITE_DATA_BACKEND?: string;
  readonly VITE_SUPABASE_URL?: string;
  /** Só a chave publishable/anon. Nunca a service_role. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
