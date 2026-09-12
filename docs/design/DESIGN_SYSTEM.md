# Design system — Yalla

**Estado:** dirección inicial + tokens en `src/design/tokens.css` (Slice 0).  
**Fecha:** 2026-09-12  
**Referencias:** [HIG Components](https://developer.apple.com/design/human-interface-guidelines/components), [Apple Design Resources](https://developer.apple.com/design/resources/) (visionOS 2 UI Kit, iOS/iPadOS/macOS).  
**Esto no es un clon de visionOS ni de iOS.** Es el lenguaje **Yalla** usando esa filosofía.

---

## 1. Personalidad

Yalla = “vamos / adelante”. El producto debe transmitir:

- **movimiento** (el día avanza, las flechas del logo)
- **eficiencia** (ops: menos toques, jerarquía clara)
- **energía positiva** (acento coral del logo, usado con contención)
- **calma operativa** (superficies quietas; el dato es el protagonista)

No es un dashboard neon, ni un clone de Liquid Glass, ni un Excel con CSS.

### Marca en una frase

Operar el día con claridad: verde para “en marcha / listo”, coral para “atención / movimiento”, grafito para estructura.

---

## 2. Logo y marca

### Evaluación del actual

Wordmark + símbolo de dos flechas (coral y verde bosque) formando una **Y** implícita. Comunica movimiento y “hacia arriba”. Encaja con el significado de Yalla.

Problemas:

- Raster PNG, no vector.
- Duplicado `public/Yalla_logo/` vs `Yalla_logo/` en la raíz, tamaños distintos.
- El icono no está pensado como app icon / maskable (el 512 maskable reutiliza el 512 “any”).
- La UI **no usa** los verdes/corales de marca: el chrome es slate genérico (`#1d2939`, `#f5f7fb`) y Reviews mete un púrpura `#6d5ef7` ajeno.

### Dirección

**El logotipo e isotipo originales se conservan.** No se redibujan.

Archivos canónicos en `public/brand/`:

- `yalla-logo.png` — lockup (isotipo + **Yalla!**)
- `yalla-mark.png` — isotipo (flechas)

Favicon y PWA siguen en `public/Yalla_logo/icon-*.png` (el mismo isotipo en recuadro claro).

El verde y el coral del logo **entran al sistema como acentos**, no como fondo de toda la app.

---

## 3. Principios extraídos de Apple (adaptados a PWA 2D)

De HIG clásico (iOS/iPadOS/macOS):

- Claridad, deferencia, profundidad.
- Contenido primero; chrome secundario.
- Navegación predecible: tab bar en iPhone, sidebar en iPad/Mac.
- 44 pt mínimo de toque; labels en controles.
- Color nunca es el único canal de estado.
- Hojas/sheets para tareas locales; páginas para trabajo largo.
- Alertas solo para consecuencias; no para cada save.
- Reduced motion: transiciones de 0 cuando el usuario lo pide.

De visionOS 2 / materials, **sin copiar glass**:

- El material comunica **jerarquía** (chrome vs contenido vs overlay), no adorno.
- La translucidez, si existe, debe mantener contraste (equivalente a vibrancy: texto más nítido que el fondo).
- Profundidad por capas y separación, no por sombras teatrales.
- No vidrio en tablas, formularios ni texto de trabajo.
- Una superficie opaca es preferible siempre que lea mejor.

---

## 4. Fundaciones (tokens a implementar)

### 4.1 Color

**Neutros (estructura)** — inspirados en materiales Apple, no en el logo:

| Token | Uso | Dirección |
|---|---|---|
| `--yl-bg` | Canvas | gris muy frío claro (`#f5f7fb` actual es válido como base) |
| `--yl-surface` | Cards, tablas | blanco |
| `--yl-surface-2` | Header/sidebar | blanco o 4% más frío |
| `--yl-text` | Primario | grafito `#101828` |
| `--yl-text-2` | Secundario | slate |
| `--yl-text-3` | Terciario / captions | |
| `--yl-stroke` | Bordes | 1px sutil, no 2px grises pesados |
| `--yl-fill` | Controles idle | fill agrupado |

**Marca**

| Token | Origen | Uso |
|---|---|---|
| `--yl-go` | Verde Knock Knock `#3D5B58` (y el bosque del mark Yalla) | Listo, on, nav activa, primary de login |
| `--yl-energy` | Coral de las flechas Yalla | Atención, early-CI, movimiento |
| `--yl-go-soft` / `--yl-energy-soft` | tints | Chips, badges |
| `--yl-kk-human` | KK `#E3B9B3` | Asociación suave (login, fills), no texto |
| `--yl-kk-sky` | KK `#A1B1C8` | Info secundaria |
| `--yl-ink` | KK dark `#415364` | Texto / botones primarios |

**Nombre intocable:** `Yalla!` (con cierre). El mark y la paleta sí pueden evolucionar (B3).

**Knock Knock:** no clonar la identidad de marketing (Gogh, Mohave, “Who’s there?”). Inspiración de color y, si encaja, una línea discreta en login. No usar violeta `#5E3653` como acento de producto.

**Semántica (no solo color)**

| Token | Uso | Refuerzo no-color |
|---|---|---|
| `--yl-success` | Listo, OK, billed | check / texto “Listo” |
| `--yl-warning` | Reorder, pending, early-CI | icono / label |
| `--yl-danger` | Delete, overdue, close irreversible | verbo + confirmación |
| `--yl-info` | Sync, Guesty, sistema | |

**Prohibido en v1:** púrpura de Review Workflow como color de producto; dark mode; gradientes.

### 4.2 Tipografía

- Stack: **system UI** (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`) para heredar SF en Apple. Dejar de declarar Inter si no se carga. Gogh/Mohave del PDF de Knock Knock no se usan en la app (son display de marketing).
- Escala (rem @ 16px): 12 / 13 / 15 / 17 / 22 / 28 / 34.
- Títulos de página: 28 desktop / 22 móvil.
- Tablas: 13–15, no 0.68rem.
- Números tabulares en KPIs y horas.

### 4.3 Espaciado

Escala **4**: 4, 8, 12, 16, 20, 24, 32, 40, 48.

En CSS **nuevo** usar propiedades lógicas (`padding-inline`, `margin-block`, `inset-inline-start`) para no rehacer layouts cuando llegue hebreo (N8). No activar `dir=rtl` hasta ese slice.

Prohibido padding “de prototipo” (13px, 11px) salvo excepción documentada.

### 4.4 Radios y elevación

- Control: 10–12px
- Card: 16px
- Sheet/modal: 20px (móvil: 16px top)
- Sombras: **una** elevación para overlay (`--yl-shadow-overlay`). Cards: borde, no sombra. Sin glass blur en contenido.

### 4.5 Breakpoints

`390` (móvil), `768` (tablet), `1024` (desktop), `1280`, `1440`.  
Validar también 375, 430 y zonas entre medias. Un solo breakpoint JS de chrome: 768.

### 4.6 Z-index

`base` 0 · `sticky` 20 · `nav` 30 · `overlay` 40 · `modal` 50 · `toast` 60 · `max` 70.

### 4.7 Motion

- 180–220ms ease-out para overlays.
- No animar layouts operativos (completar visita, marcar listo).
- `prefers-reduced-motion: reduce` → 0.

---

## 5. Componentes que el producto necesita

No construir un kit de 80 piezas. Construir **estas**:

| Primitiva | Variantes | Notas |
|---|---|---|
| `Button` | primary, secondary, ghost, destructive | Primary grafito o `--yl-go` según contexto de “acción del día”; no ambos a la vez en la misma toolbar |
| `IconButton` | 44px, tooltip + aria-label | |
| `PageHeader` | título, breadcrumb de dominio, acciones | Sustituye h1 duplicados sidebar/main |
| `SearchField` | | |
| `FilterChips` + `FilterSheet` | | |
| `SegmentedControl` | vistas día/agenda/kanban; tabs de dominio | |
| `Switch` | ya existe `YallaSwitch` — alinear a tokens | |
| `Select` / `TextField` / `TextArea` / `Checkbox` | | |
| `DateField` | | El plan de limpieza ya depende de fecha |
| `StatusBadge` | OK, Listo, Pendiente, Programado, Overdue… | Color + texto |
| `Chip` | huéspedes, early-CI, gap | |
| `Card` | KPI, list-row, empty | `StatCard` / `ProgressCard` en el catálogo |
| `DataTable` | desktop | |
| `DataTable` | desktop | |
| `ListRow` | móvil | |
| `Notice` | error/success/warning/info | Sustituye banners “Failed to fetch” crudos |
| `EmptyState` | título, cuerpo, CTA | |
| `Skeleton` | | |
| `Modal` / `Sheet` | | Sheet en <768; modal centrado en desktop. **No** meter el plan del día entero en modal de escritorio a largo plazo |
| `ConfirmDialog` | destructivo vs neutro | Adiós `window.confirm` |
| `Toast` | éxito corto | |
| `NavSidebar` / `BottomNav` / `MoreSheet` | | |
| `UserMenu` | perfil, idioma, salir | |

Componentes HIG que **no** necesitamos ahora: breadcrumbs profundos (máx. Dominio / Vista), pagination clásica (casi todo es scan/cursor), tab bar de 8 ítems, glass toolbar.

---

## 6. Navegación visual

- Sidebar desktop: wordmark **Yalla!**; ítem activo con `--yl-go-soft`.
- Colapsado: **iconos**, no la inicial de la sección.
- Móvil (≤768): topbar + drawer de dominios, para todos los roles.
- Tablet (769–1023): sidebar de iconos + tabs en el contenido.
- Escritorio (≥1024): sidebar de dominios con texto.
- Login: misma paleta, wordmark, caption opcional Knock Knock; Authenticator tematizado (B7).
- Safe-area: `env(safe-area-inset-*)`.

---

## 7. Densidad

- Desktop: denso pero con fila ≥ 44px de hit area en acciones.
- Móvil: una visita / un ítem = una card; no 8 columnas.
- KPIs: máximo 4 por bloque; el resto en “Más métricas”.

---

## 8. Accesibilidad (parte del sistema)

- Contraste AA en texto y badges.
- Foco visible 2px `--yl-go` o grafito.
- Formularios con `<label>` real.
- Estado no solo por color (badge + palabra).
- `disabled` no se usa como único mensaje de “plan listo”: el CTA pasa a “Editar plan” (ya ocurre; mantener).
- Iconos de fila de inventario: cada uno con nombre (Comprar, Extraer, Editar, Borrar).

---

## 9. Catálogo en producto

El dominio **Sistema visual** (admin) lista cada pieza con su nombre de referencia `yl.*`.

- Usar ese nombre al asignar el elemento a una vista (`yl.button.primary`, `yl.card.stat`, `yl.actionBar.page`, `yl.icon.plus`, …).
- Iconos de interfaz: lenguaje HIG (contorno en chrome, relleno en destino seleccionado). Nombres `yl.icon.*` al estilo SF Symbols; trazos originales Yalla, no el archivo de Apple.
- Si hay variación de viewport, el catálogo muestra escritorio y móvil juntos.
- Borradores nuevos se registran en Visual Lab (`localStorage`); no son producto hasta implementarlos.

---

## 10. Anti-patrones (failure modes)

- Glass en tablas, inputs o listados.
- Un lenguaje visual por módulo (Reviews púrpura, Ops slate, Finance “otro”).
- Iconos misteriosos en toolbars.
- Placeholders “coming soon” en la nav de producción.
- Copy de infraestructura hacia el usuario.
- Animaciones que retrasen marcar una limpieza listo.
