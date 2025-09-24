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

### 2. Procesamiento al final del día

* Un **cron job** o función programada se ejecuta al cierre del día.
* Recalcula el **promedio real** de temperatura y humedad del día desde la base de series temporales.
* Actualiza en Supabase la fila del día con ese promedio definitivo.

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

| fecha (DATE) | promedio\_temperatura (FLOAT) | minimo\_temperatura (FLOAT) | promedio\_humedad (FLOAT) |
| ------------ | ----------------------------- | --------------------------- | ------------------------- |

* Solo un registro por fecha.
* Durante el día se va actualizando con los valores actuales.
* Al cierre se recalcula con el promedio real.

---

### En **DB Serie Temporal (via S3)**

**Tabla: `readings`**
\| timestamp (TIMESTAMPTZ) | temperatura (FLOAT) | humedad (FLOAT) |

* Guarda cada lectura sin procesar.
* Escalable para históricos grandes.
* Sirve de base para promedios y gráficos detallados.

---

## ⚙️ API Intermedia (Edge Functions en Supabase)

### Endpoints propuestos

* **POST `[/api/ingest](https://wywcuhdexiiitliibpnu.supabase.co/functions/v1/ingest)`**
  Recibe datos de la placa.

  * Valida payload.
  * Actualiza `resumen_dia` en Supabase.
  * Inserta registro en `readings` (serie temporal).

* **GET `/api/data/daily?fecha=YYYY-MM-DD`**
  Devuelve los datos consolidados de un día específico desde Supabase.

* **GET `/api/data/historical?from=YYYY-MM-DD&to=YYYY-MM-DD`**
  Devuelve datos desde la DB de series temporales (para gráficas detalladas). Soporta agregación por granularidad:

  - Parámetro opcional `granularity`:
    - Valores: `raw` (por defecto), `1m`, `5m`, `15m`, `1h`, `1d`.
    - Comportamiento:
      - `raw`: devuelve lecturas crudas.
      - `1m|5m|15m|1h|1d`: agrega por bucket de tiempo devolviendo promedios de `temperatura` y `humedad` por marca de tiempo del bucket.

  - Ejemplos:
    - `/api/data/historical?from=2025-09-01&to=2025-09-07` → datos crudos.
    - `/api/data/historical?from=2025-09-01&to=2025-09-07&granularity=5m` → promedios cada 5 minutos.
    - `/api/data/historical?from=2025-09-01&to=2025-09-07&granularity=1h` → promedios por hora.

---

## 🔌 Integración con InfluxDB (S4R)

El backend histórico está integrado con **InfluxDB** (proveedor S4R) vía la API de consultas **Flux**. La Edge Function intenta usar Influx cuando encuentra las siguientes variables de entorno, y si faltan o hay un error, cae en un mock local de datos.

- `INFLUX_URL`: URL base de InfluxDB (ej: `https://influx.example.com`)
- `INFLUX_ORG`: Organización de InfluxDB
- `INFLUX_BUCKET`: Bucket de datos (ej: `weather`)
- `INFLUX_TOKEN`: Token con permisos de lectura sobre el bucket

### Consulta y agregación

- Measurement esperado: `readings`
- Fields: `temperatura`, `humedad`
- Rango: `from`, `to` en formato compatible con RFC3339 (la función los convierte a ISO UTC)
- Agregación: cuando `granularity != raw`, se aplica `aggregateWindow(every: <granularity>, fn: mean)` y se pivotean columnas para entregar objetos:

```json
{ "ts": "<ISO-UTC>", "temperatura": <number>, "humedad": <number> }
```

Si `granularity=raw`, se devuelve el stream crudo (sin `aggregateWindow`).

### Notas

- La función usa `pivot` y `keep` en Flux para devolver filas con ambas métricas en la misma marca de tiempo.
- Los buckets se computan en UTC.
- Si se requiere `min`, `max` o `count`, se puede extender el query Flux o hacer múltiples queries por field.

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
