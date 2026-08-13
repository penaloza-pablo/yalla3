# Diagnóstico y corrección: AWS MCP Server en Cursor

**Fecha:** 13 de agosto de 2026  
**Problema:** `aws-mcp` aparece en estado **error** en Cursor  
**Cuenta:** `471112597523` | **Rol SSO:** `amplify-policy` | **Región:** `eu-central-1`

---

## Diagnóstico realizado

### Síntoma
Cursor detecta el servidor `aws-mcp` (`user-aws-mcp`) pero falla al conectar ("failed during live tool discovery").

### Causas identificadas

| # | Causa | Evidencia |
|---|-------|-----------|
| 1 | **Cursor no encuentra `uvx`** | Cursor (app GUI) no hereda el PATH del terminal. `uvx` está en `~/.local/bin`, que no está en el PATH por defecto de macOS para apps gráficas |
| 2 | **Config incompleta** | Faltaba `AWS_REGION=eu-central-1` en metadata y env |
| 3 | **Endpoint subóptimo** | Se usaba `us-east-1` cuando existe endpoint regional en `eu-central-1` |
| 4 | **Sesión SSO** | Las credenciales SSO pueden expirar; Cursor no las renueva automáticamente |

### Lo que SÍ funciona (verificado en terminal)
- AWS CLI 2.36.22 con credenciales SSO activas
- `uvx` y `mcp-proxy-for-aws@1.6.4` arrancan correctamente
- El proxy se conecta al endpoint `https://aws-mcp.eu-central-1.api.aws/mcp`

---

## Corrección aplicada

Se actualizaron **dos archivos** con la configuración corregida:

1. `~/.cursor/mcp.json` (global — todos los proyectos)
2. `.cursor/mcp.json` (proyecto yalla3)

```json
{
  "mcpServers": {
    "aws-mcp": {
      "command": "/Users/pablo.penaloza/.local/bin/uvx",
      "args": [
        "mcp-proxy-for-aws==1.6.4",
        "https://aws-mcp.eu-central-1.api.aws/mcp",
        "--metadata",
        "AWS_REGION=eu-central-1"
      ],
      "env": {
        "AWS_REGION": "eu-central-1",
        "PATH": "/Users/pablo.penaloza/.local/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

### Cambios clave
- **Ruta absoluta** a `uvx` (soluciona el error principal)
- **Endpoint regional** `eu-central-1` (misma región que yalla3)
- **Versión fijada** del proxy (`1.6.4`, recomendada por AWS)
- **Metadata y env** con `AWS_REGION=eu-central-1`

---

## Pasos para activar la corrección

1. **Recargar Cursor:** `Cmd + Shift + P` → `Developer: Reload Window`
2. **Abrir chat nuevo**
3. **Verificar MCP:** `Cmd + Shift + P` → escribe `MCP` → `View: Open MCP Settings`
4. Confirmar que `aws-mcp` aparece **conectado** (punto verde)

Si sigue en error, renueva SSO en terminal:

```bash
aws sso login
```

Luego repite el paso 1.

---

## Permisos IAM / SSO

Tu rol actual es:
```
arn:aws:sts::471112597523:assumed-role/AWSReservedSSO_amplify-policy_64ce049a40b7c810/amplify-admin
```

### Para conectar (método SigV4 — configuración actual)

**No se requiere permiso IAM especial** solo para conectar. Basta con credenciales AWS válidas (SSO, `aws login`, etc.).

### Para usar herramientas MCP (consultar/modificar recursos AWS)

El rol `amplify-policy` necesita permisos sobre los servicios que quieras que el agente use. Para una revisión de infraestructura de yalla3, se recomienda como mínimo:

| Servicio | Permisos sugeridos | Para qué |
|----------|-------------------|----------|
| DynamoDB | `dynamodb:Describe*`, `dynamodb:List*` | Auditar tablas y GSIs |
| Lambda | `lambda:Get*`, `lambda:List*` | Revisar funciones y configs |
| CloudWatch | `cloudwatch:Get*`, `logs:Describe*`, `logs:FilterLogEvents` | Logs y métricas |
| IAM | `iam:Get*`, `iam:List*` (solo lectura) | Auditar roles/policies |
| Amplify | `amplify:Get*`, `amplify:List*` | Estado del app hosting |
| S3 | `s3:GetBucket*`, `s3:ListBucket` | Auditar bucket storage |
| Cost Explorer | `ce:Get*`, `ce:Describe*` | Análisis de costos |

**Política AWS managed recomendada para auditoría (solo lectura):**
```
arn:aws:iam::aws:policy/ReadOnlyAccess
```

### Cómo añadir permisos al permission set SSO

Necesitas acceso de **administrador de IAM Identity Center** (o pedir a quien lo tenga):

1. Abre **AWS Console** → **IAM Identity Center**
2. Ve a **Permission sets**
3. Selecciona **`amplify-policy`**
4. **Edit** → **Attach policies**
5. Añade según necesidad:
   - `ReadOnlyAccess` — para auditoría general (recomendado)
   - O políticas custom más restrictivas por servicio
6. **Save changes**
7. Ve a **AWS accounts** → tu cuenta → **Assign users/groups**
8. Selecciona el permission set y **Reprovision** (propaga cambios)

### Alternativa: OAuth (sin proxy local)

Si SigV4 sigue dando problemas, Cursor soporta OAuth directo:

```json
{
  "mcpServers": {
    "aws-mcp": {
      "url": "https://aws-mcp.eu-central-1.api.aws/mcp?oauth=initialize"
    }
  }
}
```

**Requisito IAM adicional para OAuth:** adjuntar al permission set `amplify-policy`:

```
arn:aws:iam::aws:policy/AWSMCPSignInOAuthAccessPolicy
```

Esta policy permite las acciones `signin:AuthorizeOAuth2Access` y `signin:CreateOAuth2Token`.

---

## Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| Servidor en rojo / error al iniciar | `uvx` no encontrado | Usar ruta absoluta (ya corregido) |
| `ExpiredToken` / `Unable to locate credentials` | SSO expirado | `aws sso login` + Reload Window |
| `AccessDenied` en herramientas MCP | Permisos insuficientes del rol | Añadir `ReadOnlyAccess` al permission set |
| 400 tras login OAuth | Falta policy OAuth | Añadir `AWSMCPSignInOAuthAccessPolicy` |
| Servidor tarda mucho en conectar | Primera descarga de paquetes Python | Normal (~30-60s la primera vez) |
| Herramientas vacías tras conectar | Región incorrecta | Verificar `AWS_REGION=eu-central-1` |

---

## Verificación final

Pregunta al agente en un chat nuevo:

> ¿Qué AWS Regions están disponibles?

Si responde usando herramientas MCP (no solo conocimiento general), la conexión funciona.

También puedes comprobar en terminal:

```bash
export PATH="$HOME/.local/bin:$PATH"
aws sts get-caller-identity
aws agent-toolkit list-installed-skills --region us-east-1
```
