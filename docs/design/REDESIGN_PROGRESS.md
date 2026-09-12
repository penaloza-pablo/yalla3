# Progreso del rediseño

Fuente de verdad para retomar el trabajo sin adivinar. Actualizar en cada slice.

**Rama:** `design-preview`  
**Local:** `http://127.0.0.1:5175/`  
**Preview Amplify:** `https://design-preview.dd8kh4wy2zlme.amplifyapp.com`

Estados: `Not Audited` · `Audited` · `Designed` · `Implementing` · `Implemented` · `UX Validated` · `QA Passed` · `Needs Revision`

---

## Programa

| Área | Estado | Notas |
|---|---|---|
| Entorno / PWA / tests | Implementing | theme-color Yalla; sin service worker (N2) |
| Inventario funcional | Audited | `FUNCTIONAL_INVENTORY.md` |
| IA / UX architecture | Designed | Layout por viewport (móvil / tablet / escritorio); RBAC filtra páginas |
| Design system (spec) | Designed | Paleta Yalla + inspiración KK |
| Decisiones | Audited | `DECISIONS.md` |
| Auditoría backend | Audited | `BACKEND_ARCHITECTURE_AUDIT.md` |
| Fundaciones (tokens + primitivas) | Implemented | tokens + chrome + ConfirmDialog + SegmentedControl + Toast + catálogo Visual |
| Shell nav desktop | Implemented | Dominios en sidebar + tabs internos |
| Shell nav desktop | Implemented | Dominios en sidebar + tabs internos |
| Shell nav móvil | Implemented | Mismo drawer de dominios para todos los roles; sin bottom nav de campo |
| Auth / login | Implemented | Authenticator + sign out |
| Hoy / Resumen diario | Implemented | Segmented Hoy/Día/Kanban/Agenda |
| Cleaning Plan | Implemented | Día como página; skeleton/vacío |
| Operaciones (día/agenda/kanban) | Implementing | Kanban con vacíos; inspector visita desktop |
| Unassigned / templates / auto-assign | Implementing | Tablas y formularios i18n |
| Visit detail | Implementing | Sheet móvil; inspector lateral ≥1024 |
| Inventario | Implemented | Skeleton, vacío con CTA, toast al guardar |
| Spot Check | Implementing | data-label |
| Purchases | Implementing | data-label en filas |
| Subtractions | Implementing | data-label en filas |
| Properties + Guesty | Implementing | data-label en filas |
| Reviews + workflow | Implementing | Primary verde; data-label |
| Bookings / Plan / settings | Implementing | data-label en lista |
| Cleaning Incidents / Billing / settings | Implementing | data-label incidencias y facturación |
| Maintenance * | Implementing | Incidencias y meses de facturación |
| Finance * | Implementing | Movements con data-label |
| Users / Roles / Logs / Slack | Implementing | Logs con data-label |
| Grow placeholders | Audited | Ocultos de nav (B1) |
| Logo / brand assets | Implementing | Nombre Yalla! intocable |
| i18n | Audited | es/en ahora; he N8 (dir-ready) |
| Accesibilidad | Audited | Pendiente pase sistemático en implementación |
| QA regresiones | Not Audited | Ver `QA_REPORT.md` |

---

## Checkpoint

- Fase 5 respondida 2026-09-12 (B1–B8).
- Slice 0 en local: tokens, login, `?page=` + Back, Grow oculto, wordmark, nav de campo (código; rol oficina verificado).
- Pendiente: push a preview cuando se pida.

---

## Diario breve

| Fecha | Hecho |
|---|---|
| 2026-09-12 | Fase 0–5: entorno, arqueología (código + app local), HIG, docs, briefing |
| 2026-09-12 | Slice 0: tokens, login KK/Yalla, Grow fuera de nav, URL persistente, bottom nav campo |
| 2026-09-12 | Slice 1–2: Hoy + chrome; Plan de limpieza como página; Facturación; confirms |
| 2026-09-12 | Slice 3+: inventario/ops i18n; tablas con data-label; toolbar labels; PWA theme-color |
| 2026-09-12 | Fechas Ops en locale; sheet de visita; incidencias/facturación/movements/logs |
| 2026-09-12 | Controles a tokens Yalla; sidebar de dominios + DomainTabs; inspector visita desktop; skeletons/toasts |
| 2026-09-12 | Campo iPhone: bottom nav Hoy/Plan/Incidencias/Más; hamburger fuera; tabbar no tapa acciones |
| 2026-09-12 | Oficina en móvil: tabs de dominio fijos en topbar; Hoy/Día/Kanban/Agenda visibles y sticky |
| 2026-09-12 | B2 revertido: un solo shell por viewport (móvil / tablet / escritorio); se elimina la nav de campo por rol |
| 2026-09-12 | Sistema visual: dominio admin con catálogo yl.*, frames móvil/escritorio y laboratorio de borradores |
