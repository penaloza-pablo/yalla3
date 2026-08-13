# Plan de optimización de infraestructura — yalla3

**Fecha:** 13 de agosto de 2026  
**Región:** `eu-central-1` | **Cuenta:** `471112597523`  
**Stack:** Amplify Gen2 + DynamoDB legacy + 29 Lambdas + Cognito + AppSync/Bedrock

---

## Resumen ejecutivo

La auditoría combina análisis del código (completo) con consultas AWS en vivo (bloqueadas por permisos SSO). Se identificaron **5 áreas críticas** y se implementó la **Fase 1** de seguridad.

| Prioridad | Área | Riesgo | Estado |
|-----------|------|--------|--------|
| P0 | Function URLs públicas sin auth | Alto | **Implementado** (JWT Cognito) |
| P0 | Permisos SSO insuficientes para auditoría | Medio | Pendiente (admin IAM) |
| P1 | DynamoDB Scans masivos | Costo/latencia | Planificado |
| P1 | Guesty fuera de IaC | Operacional | Parcial (env vars) |
| P2 | 29 Lambdas sin tuning memoria | Costo | Planificado |
| P2 | Sin observabilidad centralizada | Operacional | Planificado |

---

## Bloqueo actual: permisos SSO

El rol `amplify-policy` **no tiene permisos de lectura** sobre la infraestructura AWS. Las consultas MCP devolvieron `AccessDenied` en:

- `dynamodb:DescribeTable`
- `lambda:ListFunctions`
- `amplify:GetApp`
- `iam:GetRole`

### Acción requerida (admin IAM Identity Center)

1. IAM Identity Center → **Permission sets** → `amplify-policy`
2. Adjuntar **`ReadOnlyAccess`** (`arn:aws:iam::aws:policy/ReadOnlyAccess`)
3. **Reprovision** en la cuenta `471112597523`
4. Renovar SSO: `aws sso login`

Con esto el agente AWS MCP podrá auditar recursos reales (capacidad DynamoDB, memoria Lambda, costos, etc.).

### Política custom alternativa (más restrictiva)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "YallaInfraAuditReadOnly",
      "Effect": "Allow",
      "Action": [
        "dynamodb:Describe*",
        "dynamodb:List*",
        "lambda:Get*",
        "lambda:List*",
        "amplify:Get*",
        "amplify:List*",
        "s3:GetBucket*",
        "s3:ListBucket",
        "logs:Describe*",
        "logs:FilterLogEvents",
        "cloudwatch:Get*",
        "cloudwatch:List*",
        "ce:Get*",
        "ce:Describe*",
        "cognito-idp:Describe*",
        "cognito-idp:List*",
        "appsync:Get*",
        "appsync:List*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Fase 1 — Seguridad (IMPLEMENTADA)

### Problema
28 Function URLs con `authType: NONE`. El frontend hacía `fetch(url)` sin token. Cualquiera con la URL podía leer/modificar datos.

### Solución implementada
1. **`amplify/functions/shared/cognito-auth.ts`** — validación JWT Cognito (`aws-jwt-verify`)
2. **`amplify/backend.ts`** — inyecta `USER_POOL_ID` en las 29 Lambdas HTTP
3. **Todos los handlers** — rechazan requests sin `Authorization: Bearer <idToken>`
4. **`src/lib/auth-fetch.ts`** — envía token Cognito en cada request
5. **`src/App.tsx` + `src/operations/api.ts`** — migrados a `authFetch`/`fetchJson` autenticado
6. **CORS** — header `authorization` permitido en preflight

### Despliegue
Frontend y backend **deben desplegarse juntos** (Amplify pipeline-deploy). Si solo se despliega uno, las APIs devolverán 401.

### Rollback de emergencia
En cualquier Lambda, setear env `REQUIRE_AUTH=false` para desactivar validación temporalmente.

---

## Fase 2 — DynamoDB (planificada)

### Problema: Scans en 17+ handlers

Handlers que usan `ScanCommand` (costoso, no escala):

| Handler | Tabla | Alternativa |
|---------|-------|-------------|
| get-inventory | yalla-inventory | GSI por Status+Location o paginación cursor |
| get-properties | yalla-properties | Cache + paginación |
| get-alerts | yalla-alarms | GSI status-createdAt |
| get-bookings | yalla-bookings | Query por check-in date GSI |
| get-reviews | yalla-reviews | Query por fecha |
| get-purchases/subtractions | varias | Paginación obligatoria |
| get-teams/users/visit-types | referencia | **Cache en Lambda** (TTL 5min) — tablas pequeñas |
| export-inventory | yalla-inventory | Scan aceptable (batch offline) |
| upsert-* (ID generation) | varias | **Counter table** o UUID en lugar de Scan para IDs secuenciales |

### Buenas prácticas ya presentes
- `get-visits` usa **Query** con GSI `scheduledDate-scheduledStartTime-index`
- `get-tasks` usa Query con GSIs documentados
- `get-users` usa Query por teamId cuando aplica

### Acciones recomendadas
1. Auditar item counts reales (requiere permisos SSO)
2. Convertir Scans de lectura a Query/GSI donde el access pattern lo permita
3. Implementar **DynamoDB DAX** o **ElastiCache** solo si latencia lo justifica
4. Habilitar **PITR** y **deletion protection** en tablas prod
5. Revisar billing mode (on-demand vs provisioned) con métricas ConsumedCapacity

---

## Fase 3 — Lambda (planificada)

### Estado actual (código)
- Runtime: **Node.js 22** en todas
- Timeout: 20-30s
- Memoria: **default 128 MB** (no configurada explícitamente)
- Sin Lambda Powertools
- Sin X-Ray tracing

### Optimizaciones propuestas

| Cambio | Impacto | Esfuerzo |
|--------|---------|----------|
| Memoria 256MB en handlers con Scan/export | Menos timeout, mejor CPU | Bajo |
| Memoria 512MB en export-inventory + xlsx | Evita OOM en exports grandes | Bajo |
| Provisioned concurrency en get-inventory, get-visits | Elimina cold starts UI | Medio ($) |
| Consolidar handlers CRUD similares | Menos URLs, menos cold starts | Alto |
| API Gateway + Cognito authorizer (sustituir Function URLs) | Seguridad nativa AWS | Alto |

### Refactor backend.ts sugerido
Los 28 bloques `addFunctionUrl` son repetitivos. Un helper CDK reduciría mantenimiento:

```typescript
const addPublicUrl = (fn, key, outputs) => {
  outputs[key] = fn.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  }).url;
};
```

Nota: mantener `NONE` en Function URL es correcto mientras la auth JWT esté en el handler. Migrar a `AWS_IAM` rompería el browser sin SigV4.

---

## Fase 4 — Amplify / CI-CD

### Estado actual
- `amplify.yml`: backend `ampx pipeline-deploy` + frontend `npm run build`
- Sin GitHub Actions (lint/test pre-deploy)
- Build: 8GiB RAM / 4 vCPU (según logs deploy)
- Cache: `.npm` + `node_modules`

### Mejoras propuestas
1. Añadir `npm run lint` en fase frontend build
2. Cachear `amplify/node_modules` en amplify.yml
3. Branch previews para PRs (Amplify `enablePullRequestPreview`)
4. Separar sandbox dev de prod (tablas compartidas = riesgo — ver AGENT_INSTRUCTIONS)

---

## Fase 5 — Guesty e integraciones

### Estado actual
- 2 Lambdas externas hardcodeadas → **movidas a env vars** (`VITE_GUESTY_*`)
- Sync propiedades/reviews fuera del stack Amplify
- Metadatos Guesty en `visit-task-utils.ts` (sync bidireccional parcial)

### Acciones recomendadas
1. Importar Lambdas Guesty al stack CDK/Amplify
2. Secrets Guesty API en **Secrets Manager** (no env plain)
3. EventBridge schedule para sync automático (vs botón manual)
4. Dead letter queue para sync failures

---

## Fase 6 — Observabilidad y costos

### Propuesta
1. **CloudWatch Dashboard** por dominio (inventory, operations, reviews)
2. **Alarmas** en Lambda Errors, Duration p99, DynamoDB throttling
3. **S3 lifecycle** en `yalla-s3storage/inventory/` (retención exports)
4. **Cost Explorer** tags por proyecto yalla3
5. **Bedrock cost tracking** para chatbot (Claude 3 Haiku)

---

## Fase 7 — AppSync / AI

### Estado
- Modelo `Todo` (plantilla, sin uso)
- Chatbot Bedrock con 6 data tools
- `getInventoryRebuy` solo vía GraphQL (sin Function URL)

### Acciones
1. Eliminar modelo `Todo` si no se usa
2. Evaluar migrar más queries a GraphQL (auth Cognito nativa vs Function URLs)
3. Prompt caching Bedrock para reducir costos chatbot

---

## Roadmap de implementación

```
Semana 1  [DONE] Fase 1 — Auth JWT en Lambdas + frontend
Semana 1  [TODO] Admin: ReadOnlyAccess en SSO
Semana 2  Fase 2 — DynamoDB: cache referencia + paginación inventory
Semana 3  Fase 3 — Lambda memory tuning + CloudWatch alarms
Semana 4  Fase 5 — Guesty en IaC
Mes 2     Fase 3 — API Gateway migration (evaluar)
Mes 2     Fase 6 — Dashboards + cost optimization
```

---

## Archivos modificados en Fase 1

| Archivo | Cambio |
|---------|--------|
| `amplify/functions/shared/cognito-auth.ts` | Nuevo — validación JWT |
| `amplify/functions/shared/dynamo-http.ts` | CORS + export auth |
| `amplify/backend.ts` | USER_POOL_ID en Lambdas |
| `amplify/package.json` | aws-jwt-verify |
| `amplify/functions/*/handler.ts` | Auth check en 29 handlers |
| `src/lib/auth-fetch.ts` | Nuevo — fetch autenticado |
| `src/operations/api.ts` | fetchJson con token |
| `src/App.tsx` | authFetch + Guesty env vars |
| `env.local.example` | URLs Guesty |

---

## Próximo paso inmediato

1. **Desplegar** a Amplify (push a main o sandbox)
2. **Pedir ReadOnlyAccess** al admin SSO para auditoría AWS en vivo
3. Confirmar que la app funciona post-deploy (login → cargar inventario → operaciones)

Una vez desplegado Fase 1 y con permisos SSO, continuar con Fase 2 (DynamoDB Scans).
