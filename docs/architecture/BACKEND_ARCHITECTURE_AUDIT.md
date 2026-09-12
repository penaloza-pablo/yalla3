# Auditoría de arquitectura backend — Yalla

**Alcance:** observador. Rama `design-preview`. Solo lectura.  
**Fecha:** 2026-09-12  
**No autoriza refactor de backend.** Categorías 2–6 no se implementan salvo autorización explícita.

Contexto: Amplify Gen2, Cognito, AppSync residual, ~80 Function URLs, tablas `yalla-*` importadas o creadas en CDK, región `eu-central-1`. Preview de frontend reutiliza backend de `main`.

---

## Resumen ejecutivo

El rediseño visual **no está bloqueado** si se respeta el contrato actual (Cognito + `authFetch` + `amplify_outputs`). Está **condicionado** por:

1. `design-preview` no puede publicar cambios Lambda.
2. El FE importa código de `amplify/functions/shared`.
3. RBAC es solo UI.
4. Decenas de endpoints ad hoc.

### 1. Crítico / inmediato

| ID | Hallazgo | ¿Afecta rediseño FE? | Timing |
|---|---|---|---|
| F03 | Function URLs `AuthType.NONE` + CORS `*`; JWT solo en código | No (mantener `authFetch`) | After redesign (seguridad en paralelo posible) |
| F06 | RBAC **no** se aplica en Lambdas | Sí: no vender ocultar menú como seguridad | During: no debilitar. After: enforcement |
| F11-G | Proxies Guesty a Lambdas externas; `UPSTREAM_URL` hardcodeadas | Indirecto | Separate project |
| F09 | Stream ARN de `yalla-visits` hardcodeado | No | After redesign |

### 2. High-value near-term (no ahora)

Authorizer nativo o API Gateway; menos Scans / más GSI; observabilidad (Powertools, X-Ray); IAM least-privilege en Secrets/SSM.

### 3. Estructural (no ahora)

Partir `amplify/backend.ts` (~2073 líneas); consolidar Function URLs; meter Guesty en IaC; unificar Cognito vs `yalla-users` vs tabla RBAC.

### 4. Performance / escala (no ahora)

Scans en bookings/inventory/reviews/today-summary; `NotifyCleaningOverdue` cada 1 minuto; cold starts × N URLs.

### 5. Deuda técnica

AppSync casi solo chatbot + `Todo`; lógica duplicada FE/BE (`computeInventoryStatus`, fórmulas finance); 0 tests; GET de finance services con side-effect de schedule; errores 500 con `details` internos.

### 6. Opcional futuro

Migrar tablas importadas a Data/CDK first-class; PWA offline; DAX/caches; routers por dominio.

---

## Hallazgos

### F01 — Monolito `amplify/backend.ts`

| | |
|---|---|
| Área | Organización |
| Actual | Un archivo ~2073 líneas: functions, IAM, tablas, schedules, Function URLs, outputs |
| Issue | Review difícil; riesgo de regresión infra |
| Evidencia | `amplify/backend.ts` |
| Impacto ops / técnico | Deploys lentos; onboarding pobre; permisos mezclados |
| Mejora | Stacks por dominio |
| Beneficio | Review/deploy más seguros |
| Riesgo / complejidad / prioridad | Alto / High / Medium |
| ¿Afecta FE redesign? | No |
| Timing | Requires separate architectural project |

### F02 — Una Lambda por endpoint

| | |
|---|---|
| Área | API |
| Actual | ~84 handlers + `shared/` grande |
| Issue | Explosión de URLs, cold starts, outputs |
| Evidencia | `amplify/functions/*/resource.ts`, `backend.ts` |
| Mejora | Router por dominio o API Gateway |
| Riesgo / complejidad / prioridad | Alto / High / Medium |
| ¿Afecta FE? | Sí (contrato de endpoints) |
| Timing | After redesign / separate project |

### F03 — Function URLs públicas

| | |
|---|---|
| Área | Seguridad |
| Actual | `FunctionUrlAuthType.NONE`; `rejectIfUnauthenticated`; CORS `*`; `REQUIRE_AUTH=false` desactiva todo |
| Issue | Superficie enumerable; auth solo en app |
| Evidencia | `amplify/backend.ts` (~L1694+); `amplify/functions/shared/cognito-auth.ts`; `dynamo-http.ts` |
| Mejora | Authorizer Cognito/IAM + WAF |
| Prioridad | Critical |
| ¿Afecta FE? | No si se mantiene `authFetch` |
| Timing | After redesign |

### F04 — AppSync infrautilizado

| | |
|---|---|
| Área | API design |
| Actual | AppSync: inventario/alertas/chatbot; UI usa Function URLs |
| Issue | Dos canales; schema `Todo` de plantilla |
| Evidencia | `amplify/data/resource.ts`; `src/client.ts`; `src/lib/amplify-endpoint.ts` |
| ¿Afecta FE? | Sí si se toca chatbot |
| Timing | Future optimization |

### F05 — Cognito sin groups

| | |
|---|---|
| Área | Auth |
| Actual | `defineAuth({ loginWith: { email: true } })` |
| Issue | Permisos no van en el token |
| Evidencia | `amplify/auth/resource.ts` |
| ¿Afecta FE? | Sí (`PermissionsProvider`) |
| Timing | After redesign |
| Prioridad | High |

### F06 — RBAC solo frontend (Critical)

| | |
|---|---|
| Área | Authorization |
| Actual | `getMyPermissions` + `can` / `canPage`; handlers sin permiso |
| Issue | Usuario autenticado puede mutar cualquier recurso; bootstrap admin si no hay admin |
| Evidencia | `get-my-permissions/handler.ts`; `src/rbac/PermissionsProvider.tsx` |
| Mejora | `requirePermission` en mutaciones |
| ¿Afecta FE? | Sí |
| Timing | During: no debilitar. After: enforcement |
| Prioridad | Critical |

### F07 — Triple identidad de usuarios

Cognito + `yalla-users` + RBAC `USER#email`. Sync parcial (`upsert-user-role` escribe `name` en Cognito).  
Prioridad High. Timing: separate project. Afecta paneles Users/Roles.

### F08 — Tablas importadas + nombres hardcodeados

`Table.fromTableName('yalla-*')` + env en `resource.ts`. Typos (`yalla-substractions`, `yalla-visit_types`).  
No afecta FE. Timing: future.

### F09 — Stream ARN hardcodeado

`applyVisitTemplateAutoAssign` usa ARN de stream `2026-06-09…`. Si se recrea el stream, el auto-assign muere.  
Complejidad Low. Prioridad High. After redesign.

### F10 — Schedules

- `applyBookingsPlanner` 03:00 UTC  
- `NotifyCleaningOverdue` cada 1 minuto  
- `GetFinanceServices` cron diario **y** handler HTTP (side effect en lectura)

After redesign. Complejidad Low–Medium.

### F11 — Slack y Guesty acoplados

Slack: secret `yalla/slack`; `HandleSlackCommand` público (firma Slack); `APP_BASE_URL` hardcodeado a **main**.  
Guesty: invoke `yalla-syncTaskToGuesty`; tres Function URLs externas.  
Afecta preview (deep links Slack no irán a `design-preview`). Timing: During (ser conscientes) / separate (IaC Guesty).

### F12 — Lógica de negocio en UI

`App.tsx` ~9622 LOC; `computeInventoryStatus` duplicado; finance importa `property-report-formula` desde amplify.  
**Afecta rediseño: sí.** Timing During: extraer UI sin mover contratos. Prioridad High.

### F13 — Scans DynamoDB

Muchos `ScanCommand`. Visits/tasks sí usan Query/GSI. After redesign. Puede notarse como listas lentas en UI.

### F14 — Validación / errores

`parseBody` laxo; `details: error.message` al cliente (~69 handlers).  
Afecta UX de errores. During: mensajes. After: schemas.

### F15 — Observabilidad

Logs básicos + activity log Dynamo. Sin Powertools/X-Ray documentados. After redesign.

### F16 — Cero tests

Ningún runner. Prioridad High. During: smokes críticos al implementar. After: suite.

### F17 — PWA / sync

Sin Workbox. No diseñar offline. During redesign: A8.

### F18 — Hosting dual

Solo `main` hace `pipeline-deploy`. Preview FE contra API de producción.  
**Afecta rediseño: sí.** During: asumir API estable.

### F19 — Dual naming Amplify vs `yalla-*`

Deuda de claridad. Low. Future.

### F20 — IAM amplio en secrets/SSM

Planner Guesty: `GetSecretValue` / SSM `*`. After redesign. Prioridad High. No afecta FE.

### F21 — Contrato `amplify_outputs` + `VITE_*`

~70–80 keys. Romper una = pantalla vacía.  
**During redesign:** cliente HTTP único, no esparcir URLs. Prioridad High.

### F22 — Chatbot con reglas en el prompt

Misma lógica en prompt, Lambda y App. After, salvo que se rediseñe chatbot.

---

## Qué respetar ahora vs qué no asumir

| Respetar ahora | No asumir |
|---|---|
| Function URLs + `authFetch` + Cognito | Enforcement RBAC en servidor |
| Preview → backend `main` | Migración AppSync/APIGW |
| Imports `amplify/functions/shared` | Offline |
| ~80 endpoints | Partir `backend.ts` |
| Permisos = ocultar UI | Guesty dentro del stack Amplify |

---

## Relación con el rediseño frontend

Permitido tocar backend **solo** si:

- hace falta para preservar una capacidad;
- hay un blocker de UI;
- aparece una regresión;
- hay un agujero de seguridad que hace inseguro continuar (F03/F06 son reales, pero cambiarlos ahora es un proyecto aparte y puede romper ops).

Recomendación: **documentado, no migrado**, salvo un cliente HTTP tipado en el FE y no introducir llamadas nuevas que eviten JWT.
