# Arquitectura UX — Yalla

**Estado:** propuesta en implementación (Slice 0).  
**Fecha:** 2026-09-12

---

## 1. IA actual (problema)

Hoy hay **~35 destinos de primer nivel**, filtrados por RBAC, en un sidebar de secciones colapsables. En móvil el mismo árbol cabe en un drawer.

Problemas sistémicos observados en código y en `http://127.0.0.1:5175/`:

1. **Home confuso.** “Daily Operations” se muestra como “Resumen diario”, pero también es el calendario/kanban. Today está embebido, no es una página.
2. **Etiquetas colisionan.** Cleaning y Maintenance exponen `Plan / Incidencias / Historial / Ajustes`. Hay otra sección llamada `Ajustes` (Logs/Users/Roles/Slack).
3. **Grow en el menú real** lleva a “disponible pronto” y alarga el árbol.
4. **Sin URL estable.** No se puede compartir “estoy en Inventory” salvo deep links one-shot que se borran.
5. **Toolbar de iconos** (calendario, ojo, +, filtro, refresh) sin texto; affordance débil.
6. **Modales para trabajo pesado.** El plan de limpieza del día es un diálogo con tabla densa; en móvil convive mal con el drawer.
7. **Copy de prototipo** en Inventory (“ DynamoDB de producción mediante Lambda”).
8. **Confirmaciones nativas** (`window.confirm`) y **cero toasts** consistentes.
9. **Mobile = sidebar apilado**, no una IA de campo. El cleaner ve el mismo bosque que el admin, recortado por permisos.
10. **Idioma mixto** en la misma pantalla (ES chrome + EN “Planner warnings”, tipos `Room Refresh`, errores `Failed to fetch`).

---

## 2. Principios de reorganización

Tomados de HIG (iOS/iPadOS/macOS + principios de visionOS adaptados a PWA 2D):

- **Claridad:** una tarea primaria por pantalla; el resto en progressive disclosure.
- **Deferencia:** la UI cede protagonismo a visitas, stock, planes, dinero.
- **Jerarquía, no decoración:** profundidad y materiales solo para distinguir chrome / contenido / overlay.
- **La misma capacidad, distinta presentación** en móvil y escritorio.
- **Nav persistente solo donde ahorra toques.** En campo: 3–5 destinos. En oficina: sidebar de dominios.
- **No esconder operación.** Minimalismo ≠ ocultar close-month, reverse, export, Guesty refresh.

---

## 3. IA propuesta

### 3.1 Modelo mental (dominios)

```
Hoy            → pulso + atajos (Today)
Operaciones    → calendario / visitas / tareas / templates
Limpieza       → plan del día · incidencias · facturación · configuración
Mantenimiento  → (espejo)
Reservas       → lista · planificador · reglas
Inventario     → stock · conteo · compras · extracciones
Finanzas       → reportes · movimientos · servicios · grupos
Administración → usuarios · roles · logs · Slack · cuenta
```

Grow **no** forma parte de la IA de producción hasta que el módulo exista de verdad (B1). Las claves RBAC se conservan. Ver § Incorporación de módulos.

### 3.2 Escritorio (≥1024)

- **Sidebar de dominios** (no 35 links planos).
- Dentro de cada dominio: **tabs o segmented control** (Plan | Incidencias | Facturación | Ajustes).
- **Hoy** es el destino por defecto (cards del dashboard). El calendario de visitas es un tab/vista de Operaciones, no el mismo objeto que Hoy.
- Cuenta (idioma, sign out) en el pie del sidebar, como ahora, con patrón de popover en vez de página.

### 3.3 Móvil / PWA (≤768)

Dos posturas (B2), no un único “móvil genérico”:

**Oficina** — `admin`, `knock-knock-supervisor` (Knock-Knock Manager), `cleaning-supervisor`  
Uso principal escritorio. En móvil: topbar + drawer con el árbol de dominios (productividad, no tab bar de campo).

**Campo** — `cleaner`, `maintenance-agent`, `maintenance-supervisor`  
Uso principal PWA instalada. Bottom nav (máx. 5, 44px):

| Rol | Tabs |
|---|---|
| `cleaner` | Hoy · Plan limpieza · Incidencias · Más |
| `maintenance-agent` | Hoy · Plan mantenimiento · Incidencias · Más |
| `maintenance-supervisor` | Hoy · Plan mantenimiento · Inventario · Más |

**Más** abre el drawer con el resto de destinos permitidos por RBAC.

Los tipos de limpieza que vienen de datos (`Regular`, `Room Refresh`, …) se muestran **tal cual en inglés** (B5).

Los planes diarios **no viven en un modal a pantalla completa de escritorio recortado**: en móvil son **página o sheet alto** con una visita = una card, acción primaria visible.

Touch target mínimo **44×44 CSS px** (HIG iOS). No 40px.

### 3.4 Tablet (768–1023)

Sidebar colapsable a iconos + contenido; no drawer de 35 ítems ni bottom nav incompleta.

---

## 4. Mapeo actual → propuesto

| Actual (`activePage`) | Propuesto | Notas |
|---|---|---|
| Daily Operations + Today embebido | **Hoy** (dashboard) + **Operaciones** (día/agenda/kanban) | Misma capacidad, dos superficies |
| Unassigned tasks | Operaciones → tab/filtro “Sin asignar” | Sigue siendo alcanzable |
| Visit templates | Operaciones → Ajustes de visitas → Templates | |
| Template Auto Assign | Operaciones → Ajustes de visitas → Auto-asignación | |
| Inventory / Spot Check / Purchases / Subtractions | Inventario → tabs | |
| Properties / Reviews | Operaciones → Propiedades / Reviews **o** grupo “Calidad” | Reviews es workflow largo: puede merecer entrada propia bajo Operaciones |
| Bookings * | Reservas → tabs Lista / Plan / Reglas | |
| Cleaning * | Limpieza → tabs | Relabel “Historial” → **Facturación** |
| Maintenance * | Mantenimiento → tabs | |
| Property Reports / Groups / Movements / Services / Reports Settings | Finanzas → tabs | |
| Logs / Users / Roles / Slack | Administración | |
| SettingsPanel | Cuenta (perfil + idioma) | |
| Grow 1–3 | Fuera de nav (B1) | RBAC intacto; alta futura vía § Incorporación de módulos |
| VisitDetailModal | Conservar; en móvil sheet; en desktop panel/inspector preferible a modal gigante | Deep link `?visit=` se mantiene |
| Alerts (sin UI) | Sin entrada | Backend intacto |

---

## 5. Patrones de interacción a unificar

| Situación | Patrón |
|---|---|
| Lista densa de oficina (inventory, movements, bookings) | **Tabla** en desktop; **cards** en móvil (ya hay intento; sistematizar) |
| Plan del día (cleaning/maintenance) | Desktop: página split (lista días + editor). Móvil: lista de días → **página** del día |
| Detalle de visita | Inspector / sheet, no un tercer overlay encima de un modal |
| Crear / editar entidad | Página o sheet; un solo formulario primario |
| Destructivo (delete, close month, reverse) | `ConfirmDialog` con verbo explícito; nunca `window.confirm` |
| Filtros | Desktop: barra/chips. Móvil: sheet de filtros |
| Feedback | `Notice` inline para persistente; toast breve para éxito no bloqueante; error siempre en texto, no solo color |
| Vacío | Empty state con siguiente acción (no “aquí aparecerán datos de producción”) |
| Loading | Skeleton del layout real, no solo “Cargando…” en una celda |
| Icon-only | Obligatorio `aria-label` + tooltip en desktop; en móvil preferir label |

---

## 6. Primer workflow de implementación (recomendado)

No rediseñar las 35 pantallas a la vez.

**Slice 0 — Fundaciones:** tokens, login Authenticator, URL `?page=`, ocultar Grow, bottom nav de campo, primitivas.

**Slice 1 — Hoy + shell de navegación.** Es el home de todos los roles; valida el lenguaje visual con datos reales.

**Slice 2 — Limpieza / Plan del día.** Es el workflow complejo más representativo (cards, chips, selects, estados Listo/Pendiente, modal actual).

**Slice 3 — Inventario.** Tabla + cards + acciones de fila.

Luego el resto de dominios reutilizando el patrón Plan | Incidencias | Facturación | Ajustes.

---

## 7. Routing (B6)

En el **shell**, no al final del rediseño:

1. `?page=<Page Name>` es la URL canónica (nombres internos EN = RBAC).
2. `navigateToPage` hace `pushState`; Back/Forward restauran la vista.
3. `?visit=` y `?planDate=` siguen como deep links.
4. `localStorage` last-page es fallback si no hay `page` en la URL.
5. Pathnames `/cleaning/plan` son N9: un mapa posterior sobre el mismo catálogo.
6. Slack `APP_BASE_URL` sigue apuntando a `main` en producción.

## 8. Incorporación de módulos (B1)

Nunca añadir un destino de nav cuyo único contenido sea “próximamente”.

Checklist para una sección nueva:

1. **Contrato** en `FUNCTIONAL_INVENTORY.md`.
2. **RBAC:** `page:<Name>` y acciones en `rbac-catalog.ts` + seeds. No reutilizar `Grow solution *` sin migrar el nombre.
3. **IA:** tab de un dominio existente, o dominio nuevo justificado. En campo, bottom nav solo si es trabajo diario del rol; si no, Más.
4. **Empty real** (siguiente acción), nunca “coming soon” en nav.
5. **Design system:** primitivas existentes.
6. **i18n es+en** en el mismo cambio. Hebreo no bloquea (N8).
7. **QA:** inventario + 390 + 1280 + un rol oficina y un rol campo si aplica.
8. Quitar el id de `HIDDEN_NAV_SECTIONS` en `src/nav/catalog.ts` solo cuando 1–7 estén listos.

## 9. PWA

Hoy: manifest + iconos + apple-touch-meta. **Sin service worker.**

Para este rediseño:

- Tratarla como **PWA instalable** (icono, theme-color, safe-area, standalone).
- **No** prometer offline hasta que el backend sea idempotente (ver auditoría).
- Safe-area en topbar y bottom nav.
