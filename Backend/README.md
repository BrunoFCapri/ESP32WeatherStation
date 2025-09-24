# 📘 Documentación de Arquitectura – Proyecto de Sensado con Supabase + DB Serie Temporal

## 🎯 Objetivo

Diseñar una arquitectura eficiente y optimizada para almacenar, procesar y consultar mediciones de **temperatura y humedad** enviadas por sensores.
La arquitectura debe:

* Mantener en **Supabase** solo la información mínima necesaria para consultas rápidas desde la web.
* Delegar el historial completo a una **base de datos de series temporales** (compatible con protocolo S3).
* Utilizar una **API intermedia (Edge Functions en Supabase)** para centralizar la lógica de inserción y consulta.

---

## 🏗️ Flujo de Datos

### 1. Ingreso de datos (desde la placa al backend)

1. La **placa** envía una medición (temperatura, humedad, timestamp).
2. Esta solicitud va a la **API intermedia (Edge Function en Supabase)**.
3. La función ejecuta:

   * Actualiza/“pisa” la fila del día actual en Supabase:

     * `promedio_temperatura` → valor actual hasta el cierre del día.
     * `minimo_temperatura` → se actualiza si el nuevo valor es menor.
     * `promedio_humedad` → valor actual hasta el cierre del día.
   * Inserta la medición **cruda** en la base de series temporales vía S3.

---

### 2. Procesamiento al final del día - ✅ IMPLEMENTADO

* Un **cron job** o función programada se ejecuta al cierre del día (23:59 UTC).
* Recalcula el **promedio real** de temperatura y humedad del día desde la base de series temporales (InfluxDB).
* Actualiza en Supabase la fila del día con ese promedio definitivo.
* ✅ **Implementado como**: Edge Function `daily-summary-cron` + pg_cron job automático.
* ✅ **Documentación completa**: Ver `/supabase/CRON_JOB_README.md`
* ✅ **Guía de implementación web**: Ver `/implementacion.md` - Implementación completa desde la interfaz de Supabase

---

### 3. Consultas desde la web

1. La **web** no accede directo a Supabase, sino que consume la **API intermedia**.
2. La API ofrece dos endpoints:

   * **Consulta rápida (diaria o actual):** obtiene de Supabase el valor del día actual (dato actual) o de días anteriores (promedio + mínimo).
   * **Consulta histórica detallada:** redirige la petición a la base de series temporales vía S3 para traer datos completos (ej. gráfico de la última semana).

---

## 📂 Tablas y Estructuras

### En **Supabase**

**Tabla: `resumen_dia`**

| fecha (DATE) | promedio_temperatura (FLOAT) | minimo_temperatura (FLOAT) | promedio_humedad (FLOAT) |
| ------------ | ----------------------------- | --------------------------- | ------------------------- |

* Solo un registro por fecha.
* Durante el día se va actualizando con los valores actuales.
* Al cierre se recalcula con el promedio real.

---

### En **DB Serie Temporal (via S3)**

**Tabla: `readings`**  
| timestamp (TIMESTAMPTZ) | temperatura (FLOAT) | humedad (FLOAT) |

* Guarda cada lectura sin procesar.
* Escalable para históricos grandes.
* Sirve de base para promedios y gráficos detallados.

---

## ⚙️ API Intermedia (Edge Functions en Supabase) - ✅ IMPLEMENTADO

### Endpoints disponibles

* **POST `functions/v1/ingest`** ✅  
  Recibe datos de la placa.

  * ✅ Valida payload con tipos estrictos.
  * ✅ Actualiza `resumen_dia` en Supabase.
  * ✅ Inserta registro en `readings` (serie temporal) vía InfluxDB.
  * ✅ **Sin mock**: Requiere credenciales de InfluxDB válidas.
  * ✅ Manejo de errores mejorado con respuestas JSON estructuradas.

* **GET `functions/v1/daily?fecha=YYYY-MM-DD`** ✅  
  Devuelve los datos consolidados de un día específico desde Supabase.

  * ✅ Validación de parámetros y formato de fecha.
  * ✅ Manejo de errores específicos (404 para fechas sin datos).
  * ✅ Respuestas JSON consistentes.

* **GET `functions/v1/historic?from=YYYY-MM-DD&to=YYYY-MM-DD`** ✅  
  Devuelve datos desde la DB de series temporales (InfluxDB) para gráficas detalladas.  
  ✅ **Implementación completa** con soporte de agregación por granularidad y estadísticas:

  - ✅ Parámetro `granularity`: `raw` (por defecto), `1m`, `5m`, `15m`, `1h`, `1d`.
    - `raw`: devuelve lecturas crudas (ignora `stats`).
    - `1m|5m|15m|1h|1d`: agrega por bucket de tiempo devolviendo estadísticas de `temperatura` y `humedad`.

  - ✅ Parámetro `stats` (solo aplica si `granularity != raw`): `mean`, `min`, `max`.
    - Por defecto: `mean`.
    - Si se solicita una sola estadística, la respuesta no incluye campo `stat`.
    - Si se solicitan varias, se devuelve una fila por estadística y timestamp con campo `stat`.

  - ✅ **Sin mock**: Requiere credenciales de InfluxDB válidas.
  - ✅ Validación robusta de parámetros y fechas.
  - ✅ Consultas Flux optimizadas para InfluxDB.

  - Ejemplos:
    - `/api/data/historic?from=2025-09-01&to=2025-09-07` → datos crudos.
    - `/api/data/historic?from=2025-09-01&to=2025-09-07&granularity=5m` → promedios cada 5 minutos.
    - `/api/data/historic?from=2025-09-01&to=2025-09-07&granularity=1h` → promedios por hora.
    - `/api/data/historic?from=2025-09-01&to=2025-09-02&granularity=15m&stats=mean,min,max` → mean/min/max cada 15m.
    - `/api/data/historic?from=2025-09-01&to=2025-09-08&granularity=1d&stats=min,max` → min y max diarios.

  - Formatos de respuesta (ejemplos):
    - Agregado con una estadística:
      ```json
      [
        { "ts": "2025-09-01T00:00:00Z", "temperatura": 22.3, "humedad": 49.8 }
      ]
      ```
    - Agregado con varias estadísticas:
      ```json
      [
        { "ts": "2025-09-01T00:00:00Z", "stat": "mean", "temperatura": 22.3, "humedad": 49.8 },
        { "ts": "2025-09-01T00:00:00Z", "stat": "min",  "temperatura": 21.9, "humedad": 48.7 },
        { "ts": "2025-09-01T00:00:00Z", "stat": "max",  "temperatura": 22.9, "humedad": 50.4 }
      ]
      ```

  - Notas:
    - Usar fechas completas en formato ISO UTC (`YYYY-MM-DDTHH:MM:SSZ`) para mayor precisión y evitar desfases de zona horaria.
    - Si se requiere extender a otras estadísticas (ej. `count`, `spread`), se puede modificar el query Flux duplicando el patrón actual.

* **POST `functions/v1/daily-summary-cron`** ✅  
  **[NUEVO]** Función de cron job para actualizar promedios diarios reales desde InfluxDB.

  * ✅ Se ejecuta automáticamente todos los días a las 23:59 UTC via pg_cron.
  * ✅ Acepta parámetro opcional `date` (YYYY-MM-DD) en el body para procesar días específicos.
  * ✅ Consulta InfluxDB para obtener promedios reales del día.
  * ✅ Actualiza la tabla `resumen_dia` con los promedios calculados.
  * ✅ Manejo de errores completo y logging detallado.
  * ✅ **Sin mock**: Requiere credenciales de InfluxDB válidas.

  - Ejemplo de uso manual:
    ```bash
    curl -X POST https://your-project.supabase.co/functions/v1/daily-summary-cron \
      -H "Authorization: Bearer SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -d '{"date": "2024-09-23"}'
    ```

---

## 🔌 Integración con InfluxDB (S4R) - ✅ IMPLEMENTADO

El backend histórico está **completamente integrado** con **InfluxDB** (proveedor S4R) vía la API de consultas **Flux**. Las Edge Functions requieren las siguientes variables de entorno (sin fallback mock):

- `INFLUX_URL`: URL base de InfluxDB (ej: `https://influx.example.com`)
- `INFLUX_ORG`: Organización de InfluxDB
- `INFLUX_BUCKET`: Bucket de datos (ej: `weather`)
- `INFLUX_TOKEN`: Token con permisos de lectura/escritura sobre el bucket

### Consulta y agregación

- Measurement esperado: `readings`
- Fields: `temperatura`, `humedad`
- Rango: `from`, `to` en formato compatible con RFC3339 (la función los convierte a ISO UTC)
- Agregación:
  - Cuando `granularity != raw`, se aplica `aggregateWindow(every: <granularity>, fn: <mean|min|max>)` para cada estadística solicitada y luego se combinan resultados.
  - Se pivotean columnas para entregar objetos:

```json
{ "ts": "<ISO-UTC>", "temperatura": <number>, "humedad": <number> }
```

O, si múltiples estadísticas:

```json
{ "ts": "<ISO-UTC>", "stat": "mean|min|max", "temperatura": <number>, "humedad": <number> }
```

Si `granularity=raw`, se devuelve el stream crudo (sin `aggregateWindow` ni campo `stat`).

### Notas

- La función usa `pivot` y `keep` en Flux para devolver filas con ambas métricas en la misma marca de tiempo.
- Los buckets se computan en UTC.
- Si se requiere `count`, `max`, `min` adicionales o `spread`, se pueden agregar más pipelines.

---

## 🔐 Secrets y Variables de Entorno

Configura estos secrets en tu proyecto de Supabase para las Edge Functions:

- Supabase
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- InfluxDB (S4R)
  - `INFLUX_URL`
  - `INFLUX_ORG`
  - `INFLUX_BUCKET`
  - `INFLUX_TOKEN`

### Cómo configurarlos (Supabase CLI, PowerShell)

Ejecuta estos comandos en la raíz del proyecto (donde está tu `supabase/config.toml`):

```powershell
supabase secrets set SUPABASE_URL="https://<tu-proyecto>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"

supabase secrets set INFLUX_URL="https://<host-influx>"
supabase secrets set INFLUX_ORG="<org>"
supabase secrets set INFLUX_BUCKET="weather"
supabase secrets set INFLUX_TOKEN="<token>"
```

Alternativa con archivo `.env`:

```env
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
INFLUX_URL=https://<host-influx>
INFLUX_ORG=<org>
INFLUX_BUCKET=weather
INFLUX_TOKEN=<token>
```

Y luego:

```powershell
supabase secrets set --env-file ./.env
```

---

## ✅ Ventajas de esta Arquitectura

* **Rápida**: consultas comunes (día actual o históricos diarios) van directo a Supabase.
* **Escalable**: históricos completos se guardan en una DB optimizada para series temporales.
* **Económica**: Supabase solo almacena un registro por día.
* **Segura**: tanto la placa como la web consumen la misma API, sin exponer directamente las bases.
