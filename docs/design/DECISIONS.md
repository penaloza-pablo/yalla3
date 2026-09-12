# Decisiones y supuestos — rediseño Yalla

Registro vivo. Si no está aquí, no existe para el siguiente agente.

---

## Cómo usar este archivo

- **Decidido:** se implementa así.
- **Asumido:** se implementa así salvo nueva instrucción humana.
- **Bloqueante:** no implementar esa parte hasta respuesta.
- **Aplazado:** no forma parte de este proyecto.

---

## Decidido (checkpoint 2026-09-12)

| ID | Decisión |
|---|---|
| B1 | **Ocultar Grow** de la navegación de producción. Las claves RBAC `page:Grow solution *` se conservan. Toda **nueva sección** entra por el protocolo de admisión en `UX_ARCHITECTURE.md` (no se añade un item “coming soon” a la nav). |
| B2 | El chrome **no se ramifica por rol**. Solo por tamaño de dispositivo: **móvil vertical** (≤768), **tablet** (769–1023), **escritorio** (≥1024). El RBAC filtra *qué* páginas ve cada usuario, no *cómo* se navega. (Sustituye la nav campo/oficina por rol.) |
| B3 | Logo y colores de marca **modificables**. Lo único intocable es el nombre **Yalla!**. |
| B4 | Knock-Knock **no es mandatorio** en UI. Cualquier asociación es positiva. Referencia: `KnockKnock-BrandBasics.pdf` (rosa `#E3B9B3`, verde `#3D5B58`, azul claro `#A1B1C8`, azul oscuro `#415364`, violeta `#5E3653`). Yalla no se convierte en un clon de la marca KK. |
| B5 | Tipos de limpieza y valores de negocio que vienen de datos (`Regular`, `Room Refresh`, etc.) **se quedan en inglés**. El chrome de la app sigue i18n. |
| B6 | **Routing en el slice de shell**, no después de rediseñar todos los módulos. Persistimos `?page=` (History API, Back funciona). `?visit=` y `?planDate=` siguen como deep links. Pathnames `/cleaning/plan` se pueden mapear más tarde sobre el mismo catálogo. |
| B7 | **Login** (Authenticator de Amplify) entra en el rediseño. Hoy solo personaliza el logo. |
| B8 | **Hebreo:** no traducir ni activar `he` en el switcher durante este rediseño. Sí preparar `dir` + propiedades lógicas en tokens nuevos. Un catálogo hebreo + QA RTL de 35 pantallas desviaría esta tarea. Cuando existan traducciones, será un slice propio. |
| B9 | **Sidebar HIG de dos niveles** (secciones + funcionalidades). Las funcionalidades de una sección se eligen en el sidebar, no en tabs de barra superior. Iconos **regular**. La sidebar está visible por defecto; ocultarla es opt-in. Tablet no auto-colapsa a un rail de secciones. |

---

## Asumido (sigue vigente)

| ID | Decisión |
|---|---|
| A1 | Solo frontend contra backend de `main`. |
| A3 | No reintroducir Alerts en la UI. No apagar Lambdas. |
| A4 | Chatbot / Tech solution fuera del rediseño visual. |
| A5 | Sin dark mode en v1. |
| A7 | Tipografía **system UI** (SF en Apple). Gogh/Mohave del brand KK son marketing, no UI de producto. |
| A8 | Sin offline PWA. Sí: instalable, safe-area, iconos. |
| A9 | i18n de producto **es/en**. Dejar de hardcodear EN en chrome. |
| A10 | Primer slice: fundaciones + login + shell + Hoy + Plan de limpieza. |
| A11 | Relabel UI libre; no renombrar claves `page:*` / `action:*` sin migración. |
| A12 | No authz nueva en Lambdas en este proyecto. |
| A13 | Material opaco primero. |
| A14 | Conservar nombres de tabla históricos. |
| A15 | “Historial” de cleaning/maintenance → **Facturación** en la nueva IA. |
| A16 | Signup de Cognito se rediseña visualmente; no se elimina el tab salvo decisión posterior (herramienta interna). |

---

## Bloqueante

Ninguno abierto tras el checkpoint del 2026-09-12.

---

## Aplazado

| ID | Tema |
|---|---|
| N1 | Dark mode |
| N2 | Service worker / offline |
| N3 | Authz real en Lambdas |
| N4 | Partir `App.tsx` / `backend.ts` |
| N5 | AppSync como API primaria |
| N6 | CRUD de Teams |
| N7 | Resucitar Alerts |
| N8 | Locale hebreo + QA RTL de todas las pantallas |
| N9 | Pathnames REST (`/cleaning/plan`) encima de `?page=` |

---

## Protocolo de nuevas secciones (B1)

Ver `UX_ARCHITECTURE.md` § Incorporación de módulos. Resumen: spec funcional → permisos RBAC → empty real (no “coming soon” en nav) → tokens/primitivas → layout móvil/tablet/escritorio → i18n es/en (he aparte) → QA del inventario.

---

## Knock Knock vs Yalla

- Producto y wordmark: **Yalla!**
- KK aporta paleta de confianza (verde `#3D5B58`, azules, rosa humano) como **inspiración**.
- El coral de las flechas Yalla sigue siendo el acento de energía.
- No usar el violeta KK como color primario de producto (evita el drift púrpura de Reviews).
- Asociación opcional: línea discreta en login, verde de marca alineado al KK.

---

## Log

| Fecha | Qué |
|---|---|
| 2026-09-12 | Apertura. Arqueología + dirección. Checkpoint. |
| 2026-09-12 | Respuestas B1–B6, login, hebreo. Grow oculto. Routing en shell. Nav por rol. |
| 2026-09-12 | Slice 0 en código. Sign out añadido a Cuenta (no existía en la app). |
