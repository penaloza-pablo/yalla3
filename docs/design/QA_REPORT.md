# Informe QA — rediseño Yalla

**Fase actual:** baseline de descubrimiento (2026-09-12).  
**No es un QA Passed del rediseño.** Todavía no hay UI nueva que certificar.

El contrato de regresión es `FUNCTIONAL_INVENTORY.md`.

---

## Entorno verificado

| Ítem | Resultado |
|---|---|
| Rama | `design-preview` |
| `npm run dev` | `http://127.0.0.1:5175/` |
| Auth local | Sesión válida (usuario Pablo) |
| Preview Amplify | Job 1 SUCCEED; mismos outputs que `main` |
| Tests automatizados | **0** archivos `*.test.*` / `*.spec.*`; no hay script `test` |
| Lint/build | `npm run build` = `tsc && vite build` (no ejecutado en esta fase) |

---

## Recorrido manual (descubrimiento)

Realizado en local como usuario autenticado.

| Flujo | Resultado | Hallazgo |
|---|---|---|
| Login persistente | OK | Authenticator no se mostró (sesión previa) |
| Resumen diario | Render OK + datos | Banner **Failed to fetch** (EN) encima de KPIs que sí cargaron |
| Nav secciones | OK | Grow, Limpiezas, Inventario explorados |
| Inventario lista | OK, datos reales | Copy infra DynamoDB/Lambda; icon-only row actions; loading luego filas |
| Grow 1 | OK | Empty “disponible pronto” |
| Cleaning Plan lista | OK | Etiqueta nav “Plan”; empty inicial luego días Listo |
| Cleaning Plan día (modal) | OK, datos reales | Modal denso; tipos EN; chips early-CI / gap; en móvil overlay + hamburger |
| Viewport 390 | Parcial | Cards de días + hamburger; bottom chrome recortado; drawer vs modal mal coordinados |

No se ejecutaron en este pase: completar visita, close month, exports, Guesty refresh, Spot Check, Roles, Slack, Finance close, sign out.

---

## Defectos actuales (pre-rediseño) a no “certificar como OK”

1. Error `Failed to fetch` no localizado / en inglés.
2. Copy de prototipo en Inventory.
3. Mezcla ES/EN en dashboard y tipos de limpieza.
4. Placeholders Grow en nav.
5. Confirmaciones `window.confirm` (código).
6. PWA sin service worker (no es bug de producto, es límite).
7. Deep links no persistentes.

El rediseño debe **mejorar** estos puntos o registrar por qué se aplazan.

---

## Matriz de regresión (cuando haya UI nueva)

Para cada capacidad del inventario:

- [ ] Visible según rol (admin + al menos un rol restringido)
- [ ] CRUD / acción primaria
- [ ] Validación y error
- [ ] Persistencia (reload)
- [ ] Móvil ~390 y desktop ~1280
- [ ] No regresiones Guesty / close month / reverse / skip spot check

Roles mínimos a probar: `admin`, `cleaner` o `cleaning-supervisor`, `maintenance-agent`.

Anchos: 375, 390, 430, 768, 1024, 1280, 1440.

---

## Criterio de cierre (Fase 23)

El proyecto no está completo hasta que:

1. Inventario: paridad funcional confirmada.
2. Design system: consistencia visual.
3. UX: interacción y responsive.
4. QA: workflows críticos ejecutados, no solo “la página pinta”.

Hoy: **ningún gate en verde de implementación.**
