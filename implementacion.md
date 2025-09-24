# 📋 Implementación desde la Interfaz Web de Supabase

Esta guía te permite implementar el cron job para resúmenes diarios **completamente desde la página web de Supabase**, sin necesidad de usar la línea de comandos.

## 🎯 Objetivo

Configurar un trabajo automático (cron job) que cada día a las 23:59 UTC:
1. Consulte InfluxDB para obtener los promedios reales de temperatura y humedad del día
2. Actualice la tabla `resumen_dia` en Supabase con estos valores calculados

---

## 📋 Prerequisitos

- Proyecto de Supabase activo
- Instancia de InfluxDB con datos meteorológicos
- Acceso administrativo a tu proyecto de Supabase

---

## 🔧 Paso 1: Configurar Variables de Entorno

### 1.1 Navegar a Configuración de Secrets

1. Ve a tu **Dashboard de Supabase** (https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. En el menú lateral, ve a **Settings** → **Edge Functions** → **Environment Variables**

### 1.2 Agregar Variables de InfluxDB

Agrega las siguientes variables haciendo clic en **"Add new secret"**:

| Nombre | Valor | Descripción |
|--------|-------|-------------|
| `INFLUX_URL` | `https://tu-instancia-influxdb.com` | URL de tu servidor InfluxDB |
| `INFLUX_ORG` | `tu-organizacion` | Nombre de tu organización en InfluxDB |
| `INFLUX_BUCKET` | `weather` | Nombre del bucket que contiene datos meteorológicos |
| `INFLUX_TOKEN` | `tu-token-influxdb` | Token de acceso a InfluxDB |

### 1.3 Variables de Supabase (si no existen)

También verifica que existan estas variables:

| Nombre | Valor |
|--------|-------|
| `SUPABASE_URL` | `https://tu-proyecto.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Tu clave de service role |

---

## 🚀 Paso 2: Crear la Edge Function

### 2.1 Acceder al Editor de Edge Functions

1. En tu Dashboard de Supabase, ve a **Edge Functions** en el menú lateral
2. Haz clic en **"Create a new function"**
3. Nombre: `daily-summary-cron`
4. Haz clic en **"Create function"**

### 2.2 Copiar el Código de la Función

En el editor que aparece, reemplaza todo el contenido con este código:

```typescript
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

/**
 * Daily Summary Cron Job Edge Function
 * 
 * Este función está diseñada para ejecutarse al final de cada día para:
 * 1. Consultar InfluxDB para obtener los promedios diarios reales de temperatura y humedad
 * 2. Actualizar la tabla resumen_dia con los promedios calculados
 * 
 * Debe programarse para ejecutarse diariamente a las 23:59 UTC vía cron job de Supabase
 * 
 * Acepta solicitudes POST con parámetro opcional 'date' en el body (formato YYYY-MM-DD)
 * Si no se proporciona fecha, procesa el día anterior (relativo a UTC)
 */

// Configuración de Supabase
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración de InfluxDB (requerida - sin fallback mock)
const INFLUX_URL = Deno.env.get("INFLUX_URL");
const INFLUX_ORG = Deno.env.get("INFLUX_ORG");
const INFLUX_BUCKET = Deno.env.get("INFLUX_BUCKET");
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN");

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método No Permitido. Usar POST." }), 
        { status: 405, headers: { "content-type": "application/json" } }
      );
    }

    // Verificar variables de entorno requeridas de InfluxDB
    const missingVars: string[] = [];
    if (!INFLUX_URL) missingVars.push("INFLUX_URL");
    if (!INFLUX_ORG) missingVars.push("INFLUX_ORG");
    if (!INFLUX_BUCKET) missingVars.push("INFLUX_BUCKET");
    if (!INFLUX_TOKEN) missingVars.push("INFLUX_TOKEN");

    if (missingVars.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Faltan variables de entorno requeridas de InfluxDB", 
          missing: missingVars 
        }), 
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // Obtener fecha del cuerpo de la solicitud o usar día anterior
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body.date || getPreviousDay();
    } catch {
      // Si no hay cuerpo o JSON inválido, usar día anterior
      targetDate = getPreviousDay();
    }

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return new Response(
        JSON.stringify({ 
          error: "Formato de fecha inválido", 
          expected: "YYYY-MM-DD",
          provided: targetDate
        }), 
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    console.log(`Procesando resumen diario para fecha: ${targetDate}`);

    // Consultar InfluxDB para obtener promedios diarios
    const dailyAverages = await getDailyAveragesFromInfluxDB(targetDate);
    
    if (!dailyAverages) {
      return new Response(
        JSON.stringify({ 
          error: "No se encontraron datos en InfluxDB para la fecha especificada",
          date: targetDate
        }), 
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    // Actualizar tabla resumen_dia de Supabase con promedios reales
    const { error: updateError } = await supabase
      .from("resumen_dia")
      .update({
        promedio_temperatura: dailyAverages.promedio_temperatura,
        promedio_humedad: dailyAverages.promedio_humedad
      })
      .eq("fecha", targetDate);

    if (updateError) {
      console.error("Error actualizando resumen_dia:", updateError);
      return new Response(
        JSON.stringify({ 
          error: "Error al actualizar resumen diario",
          details: updateError.message
        }), 
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: "Resumen diario actualizado exitosamente",
        date: targetDate,
        averages: dailyAverages
      }), 
      { status: 200, headers: { "content-type": "application/json" } }
    );

  } catch (err) {
    console.error("Error inesperado en cron de resumen diario:", err);
    return new Response(
      JSON.stringify({ 
        error: "Error Interno del Servidor",
        details: err instanceof Error ? err.message : String(err)
      }), 
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

/**
 * Obtiene el día anterior en formato YYYY-MM-DD (UTC)
 */
function getPreviousDay(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

/**
 * Consulta InfluxDB para obtener promedios diarios de temperatura y humedad
 */
async function getDailyAveragesFromInfluxDB(date: string): Promise<{ promedio_temperatura: number, promedio_humedad: number } | null> {
  // Construir el rango de tiempo para el día completo (UTC)
  const startTime = `${date}T00:00:00Z`;
  const endTime = `${date}T23:59:59Z`;

  // Construir consulta Flux para promedios diarios
  const flux = `from(bucket: "${INFLUX_BUCKET}")
  |> range(start: time(v: "${startTime}"), stop: time(v: "${endTime}"))
  |> filter(fn: (r) => r._measurement == "readings")
  |> filter(fn: (r) => r._field == "temperatura" or r._field == "humedad")
  |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
  |> keep(columns: ["_time","_field","_value"])
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`;

  const url = `${INFLUX_URL!.replace(/\/$/, "")}/api/v2/query?org=${encodeURIComponent(
    INFLUX_ORG!
  )}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${INFLUX_TOKEN}`,
      "Content-Type": "application/vnd.flux",
      Accept: "application/csv",
    },
    body: flux,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Consulta a InfluxDB falló: ${resp.status} ${resp.statusText} - ${text}`);
  }

  const csv = await resp.text();
  console.log(`Respuesta de InfluxDB para ${date}:`, csv);
  
  // Parsear respuesta CSV
  const lines = csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  
  if (lines.length < 2) {
    // No se encontraron datos
    return null;
  }
  
  const header = lines[0].split(",");
  const idxTemp = header.indexOf("temperatura");
  const idxHum = header.indexOf("humedad");

  if (idxTemp === -1 || idxHum === -1) {
    return null;
  }

  // Obtener la primera línea de datos (debería ser solo una para agregación diaria)
  const cols = lines[1].split(",");
  if (cols.length < header.length) {
    return null;
  }

  const tStr = cols[idxTemp];
  const hStr = cols[idxHum];
  const promedio_temperatura = tStr ? Number(tStr) : NaN;
  const promedio_humedad = hStr ? Number(hStr) : NaN;

  if (isNaN(promedio_temperatura) || isNaN(promedio_humedad)) {
    return null;
  }

  return {
    promedio_temperatura,
    promedio_humedad
  };
}
```

### 2.3 Guardar y Desplegar

1. Haz clic en **"Save"** para guardar el código
2. Haz clic en **"Deploy"** para desplegar la función
3. Espera a que aparezca el mensaje de éxito

---

## 🗄️ Paso 3: Configurar la Base de Datos

### 3.1 Acceder al SQL Editor

1. En tu Dashboard de Supabase, ve a **SQL Editor** en el menú lateral
2. Haz clic en **"New query"**

### 3.2 Ejecutar Script de Configuración

Copia y pega este script SQL completo y ejecútalo:

```sql
-- Habilitar la extensión pg_cron para programar trabajos cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Crear una función que llamará a la Edge Function
CREATE OR REPLACE FUNCTION call_daily_summary_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_data jsonb;
BEGIN
  -- Llamar a la Edge Function usando extensión http
  -- Nota: En producción, reemplaza la URL con tu URL real del proyecto Supabase
  SELECT 
    net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/daily-summary-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) INTO response_data;
  
  -- Registrar el resultado (opcional)
  RAISE NOTICE 'Trabajo cron de resumen diario completado con respuesta: %', response_data;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Trabajo cron de resumen diario falló: %', SQLERRM;
END;
$$;

-- Crear el trabajo cron de resumen diario que se ejecuta todos los días a las 23:59 UTC
-- Esto llamará a nuestra Edge Function vía la función de base de datos
SELECT cron.schedule(
  'daily-summary-update',  -- nombre del trabajo
  '59 23 * * *',          -- expresión cron: ejecutar a las 23:59 todos los días (UTC)
  'SELECT call_daily_summary_cron();'
);

-- Agregar un comentario para documentar este trabajo cron
COMMENT ON FUNCTION call_daily_summary_cron IS 'Llama a la Edge Function daily-summary-cron para actualizar la tabla resumen_dia con promedios reales de InfluxDB';

-- Crear o recrear la estructura de la tabla resumen_dia (si no existe)
CREATE TABLE IF NOT EXISTS resumen_dia (
  fecha DATE PRIMARY KEY,
  promedio_temperatura FLOAT NOT NULL,
  promedio_humedad FLOAT NOT NULL,
  minimo_temperatura FLOAT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear una función trigger para updated_at si no existe
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Crear el trigger para actualizar updated_at en resumen_dia
DROP TRIGGER IF EXISTS update_resumen_dia_updated_at ON resumen_dia;
CREATE TRIGGER update_resumen_dia_updated_at
    BEFORE UPDATE ON resumen_dia
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Otorgar permisos necesarios para que el trabajo cron funcione
-- Nota: En producción, configurarías políticas RLS apropiadas
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT SELECT ON cron.job TO postgres;
```

### 3.3 Ejecutar el Script

1. Haz clic en **"Run"** para ejecutar todo el script
2. Verifica que no haya errores en la consola
3. Deberías ver mensajes de confirmación para cada operación

---

## ✅ Paso 4: Verificar la Configuración

### 4.1 Comprobar el Trabajo Cron

En el SQL Editor, ejecuta esta consulta para verificar que el cron job se programó correctamente:

```sql
-- Verificar si el trabajo cron está programado
SELECT * FROM cron.job WHERE jobname = 'daily-summary-update';
```

Deberías ver una fila que muestra:
- **jobname**: `daily-summary-update`
- **schedule**: `59 23 * * *`
- **active**: `t` (verdadero)

### 4.2 Probar la Edge Function Manualmente

1. Ve a **Edge Functions** → **daily-summary-cron**
2. Haz clic en la pestaña **"Invocations"** o **"Test"**
3. En el cuerpo de la solicitud, pon:
```json
{
  "date": "2024-09-23"
}
```
4. Haz clic en **"Send request"**
5. Verifica que obtienes una respuesta exitosa

### 4.3 Verificar la Tabla de Datos

Ejecuta esta consulta para ver los datos en `resumen_dia`:

```sql
-- Verificar registros recientes en resumen_dia
SELECT * FROM resumen_dia 
ORDER BY fecha DESC 
LIMIT 10;
```

---

## 🔍 Paso 5: Monitoreo y Solución de Problemas

### 5.1 Ver Historial de Trabajos Cron

```sql
-- Verificar ejecuciones recientes del trabajo cron
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-summary-update')
ORDER BY start_time DESC 
LIMIT 10;

-- Verificar ejecuciones fallidas
SELECT * FROM cron.job_run_details 
WHERE status = 'failed' 
ORDER BY start_time DESC;
```

### 5.2 Ver Logs de Edge Function

1. Ve a **Edge Functions** → **daily-summary-cron** → **Logs**
2. Aquí puedes ver los detalles de ejecución y cualquier error

### 5.3 Prueba Manual con Fecha Específica

Para probar o reprocesar un día específico:

```bash
# Ejemplo usando curl (desde terminal)
curl -X POST https://tu-proyecto.supabase.co/functions/v1/daily-summary-cron \
  -H "Authorization: Bearer TU-SERVICE-ROLE-KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-09-23"}'
```

O usa el panel de **Test** en la Edge Function con el JSON:
```json
{
  "date": "2024-09-23"
}
```

---

## 🎉 ¡Configuración Completa!

Tu sistema ahora:

✅ **Se ejecuta automáticamente** todos los días a las 23:59 UTC
✅ **Consulta InfluxDB** para obtener promedios reales del día anterior
✅ **Actualiza Supabase** con los valores calculados
✅ **Reemplaza valores temporales** con estadísticas precisas

### Próximos Pasos Automáticos

1. **23:59 UTC Diariamente**: El cron job se ejecuta automáticamente
2. **Consulta InfluxDB**: Obtiene promedios de temperatura y humedad
3. **Actualiza Base de Datos**: Actualiza `resumen_dia` con valores reales
4. **Logs Disponibles**: Puedes monitorear la ejecución en los logs

¡Tu estación meteorológica ahora tiene procesamiento automatizado de resúmenes diarios completamente configurado desde la interfaz web de Supabase! 🌤️