# Inventario funcional — Yalla

**Estado:** contrato funcional del rediseño (Fase 1).  
**Fecha:** 2026-09-12  
**Rama:** `design-preview`  
**App local inspeccionada:** `http://127.0.0.1:5175/` (sesión autenticada)  
**Hosting preview:** `https://design-preview.dd8kh4wy2zlme.amplifyapp.com`  
**Backend:** el de `main` (Cognito, Function URLs, tablas `yalla-*`)

Este documento es el contrato. Ningún rediseño puede eliminar una capacidad aquí listada salvo que se demuestre duplicada u obsoleta y quede registrado en `DECISIONS.md`.

---

## 1. Qué es el producto

Yalla es el **sistema operativo interno** de un operador de alquiler vacacional (propiedades en Madrid y alrededores, sincronizadas con Guesty).

No es un marketplace ni una app para huéspedes. Es una PWA de trabajo para:

| Persona | Rol en código | Trabajo diario |
|---|---|---|
| Administración | `admin` | Todo: usuarios, roles, finanzas, Slack, sync Guesty |
| Supervisor Knock-Knock | `knock-knock-supervisor` | Ops + inventario + bookings + cleaning + maintenance; sin Users/Roles/Finance/Grow |
| Supervisor de limpieza | `cleaning-supervisor` | Plan, incidencias, billing y settings de limpieza; inventario; bookings; Daily Ops |
| Limpiadora | `cleaner` | Daily Ops, Cleaning Plan, Cleaning Incidents |
| Supervisor de mantenimiento | `maintenance-supervisor` | Plan/incidencias/billing de mantenimiento + ops/inventario/bookings |
| Agente de mantenimiento | `maintenance-agent` | Daily Ops, Maintenance Plan, Maintenance Incidents |

El valor del producto es **orquestar el día**: visitas, limpiezas, mantenimiento, stock, reservas, reviews y cierre financiero mensual, con datos persistentes en DynamoDB y sync hacia/desde Guesty.

---

## 2. Cómo está construida la UI

- SPA React 18 + Vite. **Sin React Router.**
- Navegación por estado `activePage` en `src/App.tsx` (~9.6k líneas).
- Catálogo de páginas y permisos: `amplify/functions/shared/rbac-catalog.ts`.
- Persistencia de última página: `src/lib/lastActivePage.ts` (TTL 1 h).
- Deep links one-shot: `?page=`, `?visit=`, `?planDate=` (se borran con `history.replaceState`).
- Auth: Amplify `Authenticator` (Cognito email) en `src/main.tsx`.
- i18n: `es` / `en` (`src/i18n/locales/`).
- API: Function URLs (`src/lib/amplify-endpoint.ts` + `authFetch`). AppSync casi solo chatbot/Todo legacy.

---

## 3. Mapa de navegación actual

**Core (siempre visible)**

- Daily Operations → en UI ES: **Resumen diario** (incluye `TodayView` embebido; no es item de nav propio)

**Secciones** (`NAVIGATION`)

```
Inventory     → Inventory | Spot Check | Purchases | Subtractions
                ES: Inventario | Revisión y conteo | Compras | Extracciones
Ops           → Properties | Reviews | Unassigned tasks | Visit templates | Template Auto Assign
Bookings      → Bookings | Bookings Plan | Bookings settings
Cleaning      → Cleaning Plan | Cleaning Incidents | Cleaning Billing | Cleaning settings
                ES sidebar: Plan | Incidencias | Historial | Ajustes  (etiquetas ambiguas)
Maintenance   → Maintenance Plan | Incidents | Billing | settings  (mismo patrón de etiquetas)
Settings      → Logs | Users | Roles | Slack
Grow          → Grow solution 1 | 2 | 3   → placeholders “coming soon”
Finance       → Property Reports | Reports Settings | Property Groups | Movements | Services & Subscriptions
```

**Fuera del catálogo de nav**

- `SettingsPanel`: perfil Cognito, idioma, sign out
- `VisitDetailModal`: detalle global de visita (`?visit=`)

---

## 4. Modelo RBAC

Permisos:

- Páginas: `page:<Page Name>` (nombre EN interno)
- Acciones: `action:*` (cerrar meses, crear inventario/compras/visitas, editar billing, cards del dashboard, etc.)

**Importante para el contrato:** el RBAC **solo oculta UI**. Las Lambdas no comprueban permiso. Un usuario autenticado puede llamar cualquier Function URL. El rediseño no debe presentar la ocultación de menú como seguridad.

Si falta `getMyPermissionsUrl`, el cliente hace bootstrap con todos los permisos (modo dev).

---

## 5. Capacidades por módulo

Leyenda de estados típicos: loading, empty, error, success/notice, permiso denegado (`rbac.noAccess`).

### 5.1 Daily Ops / Today

| Campo | Contenido |
|---|---|
| **Pantallas** | `src/today/TodayView.tsx` (hub) + `src/operations/DailyOperationsView.tsx` (calendario/kanban/agenda/día) + `OperationsDayView`, `OperationsAgendaView`, `OperationsKanbanView` |
| **Objetivo** | Ver el pulso del día y ejecutar visitas/tareas |
| **Acciones** | Cambiar vista día/agenda/kanban; filtrar team/status/property/user/check-in\|out; crear/editar visita; completar (wizard horas/special); cancelar; refrescar Guesty; abrir detalle; aplicar templates; navegar a planes/billing/reviews/unassigned/inventory desde cards |
| **Inputs** | Fecha (Madrid), filtros, formulario visita/tarea |
| **Outputs** | KPIs (limpieza/mantenimiento/ops/inventario), lista/calendario de visitas |
| **Permisos** | `page:Daily Operations`; `action:dailyOps.create`; `action:visit.moreInfo`; `action:createTasks`; `action:dashboard.card.*` |
| **Backend** | `get-today-summary`, `get/upsert-visit`, `get/upsert-task`, `get-teams`, `get-users`, `get-visit-types`, `get-bookings`, cleaning plan lookup |
| **UX observada (2026-09-12)** | Banner **“Failed to fetch”** en inglés sobre el dashboard; cards con copy mixto ES/EN (`Planner warnings`, `Purchases & Inventory`); iconos de toolbar sin texto; Today no es página de nav |
| **Rediseño** | Separar Home (resumen) de calendario ops; deep links estables; no perder ningún modo de vista ni filtro |

### 5.2 Unassigned tasks / Visit templates / Template Auto Assign

| Capacidad | Pantalla | Acciones | Backend | Notas |
|---|---|---|---|---|
| Tareas sin asignar | `DailyOperationsView` `mode="unassigned"` | Pool, crear, asignar, editar si `unassignedTasks.edit` | `get-tasks?pool=unassigned`, `upsert-task` · `yalla-tasks` | |
| Visit templates | `VisitTemplatesPanel.tsx` | CRUD template (property/team/type/tasks), filtros, search | `get/upsert-visit-template` · `yalla-visit-templates` | |
| Template Auto Assign | `TemplateAutoAssignView.tsx` | CRUD reglas property→template | `get/upsert-visit-template-auto-assign`, `apply-visit-template-auto-assign` | Apply puede ser stream/cron; UI es CRUD |

### 5.3 Visit detail

| Campo | Contenido |
|---|---|
| **Pantalla** | `src/operations/VisitDetailModal.tsx` |
| **Acciones** | Ver/editar tasks, más info (gated), refresh Guesty, usar template, completar/cancelar según contexto |
| **Permiso extra** | `action:visit.moreInfo` |
| **Contrato** | El deep link `?visit=` debe seguir abriendo el detalle desde cualquier módulo |

### 5.4 Inventory

| Campo | Contenido |
|---|---|
| **Pantalla** | Inline en `App.tsx` |
| **Acciones** | Search, filtros status/location/category, atajo warnings, CRUD (create gated), delete, export XLSX (`ExportScopeModal`), expand row (rebuy / consumption) |
| **Estados derivados** | OK / Low Stock / Reorder / Waiting Delivery |
| **Permisos** | `page:Inventory`; `action:inventory.create`; `action:inventory.editItems` |
| **Backend** | `get/upsert/delete-inventory`, `export-inventory` · `yalla-inventory` · S3 `yalla-s3storage` |
| **UX observada** | Copy de infraestructura en la página (“ DynamoDB … Lambda”); “Aquí aparecerán los datos en vivo de producción”; filas con 4 icon buttons (compra, resta, editar, borrar) poco etiquetados; tabla densa |
| **Contrato** | Conservar export scope filtered vs all, expand row, y los cuatro atajos de fila |

### 5.5 Spot Check

| Campo | Contenido |
|---|---|
| **Pantalla** | `src/SpotCheckPanel.tsx` |
| **Acciones** | Wizard location (JCL/P2) + categorías → count ±1/±10 → Check / Skip / Complete; historial |
| **Permisos** | `page:Spot Check`; `action:spotCheck.create` |
| **Backend** | `get-spot-checks`, `complete-spot-check` |
| **Contrato** | Skip no debe cambiar cantidades; Complete persiste el conteo |

### 5.6 Purchases

| Campo | Contenido |
|---|---|
| **Pantalla** | Inline `App.tsx` |
| **Flujo** | To be confirmed → Waiting Delivery → Waiting invoice → Confirmed; compra directa a property; exclude from report; delete direct |
| **Permiso** | `action:purchases.create` |
| **Backend** | `get/upsert-purchase` · `yalla-purchases` (actualiza inventario) |

### 5.7 Subtractions (Extracciones)

| Campo | Contenido |
|---|---|
| **Pantalla** | Inline `App.tsx` |
| **Acciones** | Restas a inventario / cargo a property; IVA; mark billed / reverse; export |
| **Backend** | `get/upsert-subtraction`, `export-subtractions` · `yalla-substractions` (typo histórico del nombre de tabla: no renombrar en este proyecto) |
| **Contrato** | Reverse debe restaurar stock |

### 5.8 Properties / Reviews / Bookings

| Capacidad | Acciones clave | Backend | Contrato |
|---|---|---|---|
| Properties | Lista, filtros, Refresh vs Guesty (diff add/update/remove), banner mismatch nicknames dismissible | `get/upsert/delete-property`, `proxy-guesty-listings` · `yalla-properties` | MTL parents excluidos; permiso `properties.updateFromGuesty` |
| Reviews | Sync Guesty, filtros rating/fechas/status, detalle, workflow multi-step | `get-reviews`, `get-reviews-sync-state`, `proxy-guesty-reviews-sync`, `update-review-workflow` | Conservar todos los pasos del workflow; el panel púrpura es drift visual, no funcional |
| Bookings lista | Cursor pagination, sync Guesty, filtros status, linen / early CI / gift card | `get-bookings`, `proxy-guesty-bookings-sync` | |
| Bookings Plan | Planner: linen badges, early CI, warnings dismiss; edición si planner ON | `upsert-booking-planner-fields` | |
| Bookings settings | Toggle planner, apply window, Apply now, reglas por property | `get/upsert-bookings-planner-settings`, `apply-bookings-planner` | Apply now es operación real contra producción |

### 5.9 Cleaning

Patrón de dominio: **Plan → Incidencias → Billing (Historial) → Settings**.

| Capacidad | Acciones | Permisos | Backend |
|---|---|---|---|
| Cleaning Plan | Elegir fecha; asignar cleaner, hora, quality check, amenities kit; Save draft / Mark ready / Reopen; sync tiempos a visits/Guesty; abrir visita | `page:Cleaning Plan` | `get/upsert-cleaning-plan`, `get-cleaners` |
| Cleaning Incidents | CRUD ligados a cleaner/visit/property | `page:Cleaning Incidents` | `get/upsert-cleaning-incident` |
| Cleaning Billing | Meses, líneas, close month, export, precios gated | `cleaningBilling.closeMonth`, `.edit`, `.prices` | `get/upsert-cleaning-billing`, export |
| Cleaning settings | Cleaners CRUD; tipos/precios/duración por property; amenities kit rules | `page:Cleaning settings` | cleaners, `property-cleaning-details` |

**Observado en local (12/09/2026):** el plan del día se edita en **modal/sheet** con chips (huéspedes, entrada temprana, Bookings Gap), tipos EN (`Regular`, `Room Refresh`) y acciones Guardar borrador / Marcar listo / Editar plan. En móvil el modal convive mal con el drawer. Early-CI cutoff 12:30 / suggest 11:00 están hardcodeados: no cambiar la regla de negocio en el rediseño visual.

Meses ocultos: `hiddenBillingMonths` incluye `2026-06` — conservar comportamiento.

### 5.10 Maintenance

Espejo de cleaning: Plan, Incidents, Billing, Settings.

Permisos extra: `maintenanceBilling.closeMonth`, `.edit`, `.hoursRemaining`, `.checkAfterEstimate`.

Contrato: hours bank / special hours al completar visita; check-after-estimate.

### 5.11 Finance

| Capacidad | Acciones | Permiso especial | Backend |
|---|---|---|---|
| Property Reports | Reportes mensuales por property/grupo; fórmulas comisión; cerrar mes | `propertyReports.closeMonth` | `get/upsert-property-report` |
| Reports Settings | Fórmulas globales default | | |
| Property Groups | Grupos de reporting (P2 rooms, aliases) | | `upsertProperty` / `deleteProperty` (tipo grupo) |
| Movements | Income/outcome, IVA, Pending Billing / Billed / Not Billable | | `get/upsert-finance-movement` |
| Services & Subscriptions | Recurrentes + billing items; IVA | | `get/upsert-finance-service` |

Aliases legacy RBAC: `Finance solution 1/2/3` → Property Reports / Movements / Services. Conservar alias en backend/permisos; no hace falta mostrar esos nombres en nav.

### 5.12 Settings / admin

| Capacidad | Acciones | Backend |
|---|---|---|
| Logs | Filtro feature/user/presets today\|last100; detalle | `get-activity-logs` |
| Users | Lista Cognito; asignar role; display name | `getCognitoUsers` / `getUsers`, `upsertUserRole` |
| Roles | CRUD nombre + checklist pages/actions/dashboard cards | `get/upsert-role` |
| Slack | Toggles por automation (overdue cleaning, visit closed comments, `/yalla hoy`, plan reopened/changes, early CI ready, EOD plans, late delivery, late visit after 13:01) | `get/upsert-slack-notification` |
| Account | Perfil + `LanguageSwitcher` + sign out | Cognito |

### 5.13 Placeholders y residuales (no borrar datos; sí decidir IA)

| Ítem | Estado | Contrato de rediseño |
|---|---|---|
| Grow 1–3 | Nav real → “Esta sección estará disponible pronto.” **Ocultas de la nav (B1).** | No borrar claves RBAC. Alta futura: protocolo de módulos en UX_ARCHITECTURE |
| Alerts | i18n + Lambdas `get/upsert/update-alert` · `yalla-alarms`; **sin página** | No hay UI que preservar; no apagar Lambdas en este proyecto |
| Chatbot / Tech solution | i18n/CSS residual; sin pantalla | Fuera del rediseño visual salvo que se decida lo contrario |
| Teams | Sin CRUD UI; `getTeams` alimenta filtros | Conservar consumo; no inventar CRUD Teams sin decisión |
| `getInventoryRebuy` | Lambda viva; UI calcula status local | No eliminar endpoint |

---

## 6. Viajes de usuario cross-screen

1. **Apertura del día (supervisor):** Resumen diario → cards Cleaning/Maintenance Plan → marcar plan listo → Daily Ops día → completar visitas → billing mes abierto.
2. **Campo (cleaner / agent):** Daily Ops o Plan del día → detalle visita → completar / incidencia.
3. **Stock bajo:** card inventario → Inventory (Reorder/Low) → Purchase create → confirmación entrega → stock OK; o Spot Check.
4. **Checkout huésped:** Bookings Plan (linen / early CI) → Cleaning Plan amenities → Subtraction/billing a property → Property Report.
5. **Review mala:** card reviews → Reviews → workflow steps → Closed.
6. **Sync Guesty:** Properties Refresh → apply diffs; Bookings Refresh; Reviews Refresh.
7. **Slack campo:** `/yalla hoy` (fuera de la PWA) → deep link a `main` hoy (`APP_BASE_URL` hardcodeado).
8. **Deep link visita:** `?visit=` abre modal global; `?page=Cleaning Plan&planDate=` abre día.
9. **Onboarding admin:** Users assign role → Roles tune pages → el usuario ve solo su menú.
10. **Cierre finance:** Movements/Services → Property Reports close month → ClosedReport.
11. **Escala de templates:** Visit templates → Auto Assign rules → apply (backend) crea visitas.

---

## 7. Funcionalidad poco clara (no eliminar)

- Grow 1–3: reserva de producto sin spec.
- Alerts: backend huérfano.
- Chatbot i18n/CSS.
- `HIDDEN_BILLING_MONTH_IDS = 2026-06`.
- Review workflow con copy placeholder / lorem en algún tramo.
- Teams sin UI de gestión.
- Doble “Ajustes” en sidebar (dominio vs sección Settings).

---

## 8. Reglas de paridad

1. Toda acción listada permanece alcanzable para el rol que hoy la tiene.
2. No se cambian reglas de negocio (horas early-CI, IVA, close month, reverse subtraction, Skip de spot check, etc.) para simplificar UI.
3. Los nombres internos de página EN (`page:Cleaning Plan`) son API de permisos: se pueden relabelar en UI, no renombrar la clave sin migración RBAC.
4. El rediseño puede cambiar layout, nav, componentes y copy de infraestructura (p. ej. textos DynamoDB/Lambda).
5. Placeholders Grow: visibles hoy; su destino se decide en el checkpoint humano.
