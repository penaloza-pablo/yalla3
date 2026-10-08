/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GET_ACTIVITY_LOGS_URL?: string
  readonly VITE_GET_TODAY_SUMMARY_URL?: string
  readonly VITE_GET_SLACK_NOTIFICATIONS_URL?: string
  readonly VITE_UPSERT_SLACK_NOTIFICATION_URL?: string
  readonly VITE_GET_YALLA_SERVICES_URL?: string
  readonly VITE_DIAGNOSE_YALLA_SERVICES_URL?: string
  readonly VITE_AI_AGENTS_URL?: string
}
