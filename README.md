Estación Meteorológica ESP32 con Integración Supabase e InfluxDB
Una estación meteorológica inteligente basada en ESP32 que lee datos de temperatura y humedad mediante un sensor DHT22 y los almacena en una arquitectura híbrida Supabase + InfluxDB. El proyecto incluye configuración WiFi automática, servidor web RESTful, portal cautivo para configuración inicial y una API centralizada mediante Edge Functions.

## 🌐 Enlaces del Proyecto

- **Aplicación Web**: [https://clima-zero-3xlfopf5y-brunofcapris-projects.vercel.app](https://clima-zero-3xlfopf5y-brunofcapris-projects.vercel.app/)
- **Repositorio Web**: https://github.com/BrunoFCapri/ClimaZero

## 📋 Tabla de Contenidos

- [🚀 Características](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🏗️ Arquitectura del Sistema](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🔧 Componentes de Hardware](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🔌 Esquema de Conexión](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [📦 Instalación](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [⚙️ Configuración](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🌐 API Endpoints](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🔗 Edge Functions](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [📁 Estructura del Proyecto](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🗄️ Base de Datos](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🎯 Uso](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)
- [🔍 Troubleshooting](https://www.notion.so/Estaci-n-Meteorol-gica-ESP32-con-Integraci-n-Supabase-e-InfluxDB-2a786fb3dee2809ca09cc4e603aea9f9?pvs=21)

## 🚀 Características

- **Lectura de Sensores**: Monitoreo continuo de temperatura y humedad con sensor DHT22
- **Conectividad WiFi**: Conexión automática a redes WiFi con portal de configuración
- **API RESTful**: Endpoints HTTP para acceso a datos y configuración
- **Portal Cautivo**: Interfaz web para configurar credenciales WiFi
- **Arquitectura Híbrida**: Almacenamiento optimizado con Supabase (datos resumidos) + InfluxDB (datos históricos)
- **Edge Functions**: API centralizada para ingesta y consulta de datos
- **Indicadores LED**: Estado visual de conexión y operación
- **Frecuencia Configurable**: Ajuste dinámico de la frecuencia de lectura de sensores

## 🏗️ Arquitectura del Sistema

### Diseño de Arquitectura

El sistema utiliza una arquitectura híbrida optimizada para diferentes tipos de consultas:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ESP32 Sensor  │ ──▶│  Edge Functions  │ ──▶│   Supabase      │
│                 │    │   (API Layer)    │    │  (resumen_dia)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              └─────────────▶┌─────────────────┐
                                             │   InfluxDB      │
                                             │  (readings)     │
                                             └─────────────────┘

```

### Flujo de Datos

### 1. Ingreso de Datos (ESP32 → Backend)

1. La placa ESP32 envía mediciones (temperatura, humedad, timestamp)
2. Los datos llegan a la API intermedia (Edge Function en Supabase)
3. La función ejecuta:
    - Actualiza la fila del día actual en Supabase (`resumen_dia`)
    - Inserta la medición cruda en InfluxDB vía API

### 2. Procesamiento Diario

- Un cron job se ejecuta al cierre del día
- Recalcula el promedio real de temperatura y humedad desde InfluxDB
- Actualiza en Supabase la fila del día con el promedio definitivo

### 3. Consultas desde la Web

- **Consultas rápidas**: Obtienen de Supabase el valor del día actual o de días anteriores
- **Consultas históricas**: Redirigen a InfluxDB para datos completos y gráficos

## 🔧 Componentes de Hardware

### Requisitos

| Componente | Cantidad | Descripción |
| --- | --- | --- |
| ESP32 DevKit | 1 | Microcontrolador principal |
| Sensor DHT22 | 1 | Sensor de temperatura y humedad |
| LED | 1 | Indicador de estado (opcional, usar LED integrado) |
| Resistencia 10kΩ | 1 | Pull-up para DHT22 |
| Protoboard | 1 | Para conexiones |
| Cables Dupont | Varios | Conexiones |

### Especificaciones Técnicas

- **Voltaje de Operación**: 3.3V - 5V
- **Rango de Temperatura**: -40°C a +80°C (DHT22)
- **Rango de Humedad**: 0-100% RH (DHT22)
- **Precisión**: ±0.5°C, ±2-5% RH
- **Conexión**: WiFi 802.11 b/g/n

## 🔌 Esquema de Conexión

```
ESP32 DevKit V1      DHT22
================     =====
GPIO 13       -----> Data Pin
3V3           -----> VCC
GND           -----> GND

LED Integrado: GPIO 2 (ya conectado)
Botón Boot: GPIO 0 (ya conectado)

```

### Diagrama de Conexión

```
         ESP32
    ┌─────────────┐
    │    3V3      │ ────┬──── VCC (DHT22)
    │    GND      │ ────┼──── GND (DHT22)
    │    GPIO 13  │ ────┴──── DATA (DHT22)
    │    GPIO 2   │ ────────  LED Interno
    │    GPIO 0   │ ────────  Botón Boot
    └─────────────┘

```

## 📦 Instalación

### 1. Preparar el Entorno

1. **Instalar MicroPython en ESP32**:
    - Descargar firmware MicroPython desde [micropython.org](https://micropython.org/download/esp32/)
    - Flashear usando `esptool.py`:
    
    ```bash
    pip install esptool
    esptool.py --chip esp32 --port COM_PORT erase_flash
    esptool.py --chip esp32 --port COM_PORT write_flash -z 0x1000 firmware.bin
    
    ```
    

### 2. Subir Archivos al ESP32

1. **Conectar ESP32** al puerto serie
2. **Subir archivos** usando herramientas como:
    - Thonny IDE
    - ampy
    - uPyCraft
    - VS Code con extensión MicroPython

### 3. Estructura de Archivos en ESP32

```
/
├── boot.py          # Inicialización del sistema
├── main.py          # Código principal
└── wifi.txt         # Credenciales WiFi (generado automáticamente)

```

## ⚙️ Configuración

### Primera Configuración

1. **Encender el ESP32**
2. **Conectar al AP**: Busca la red WiFi `ESP32-CONFIG`
3. **Contraseña**: `micropython`
4. **Abrir navegador**: Ve a `http://192.168.4.1`
5. **Ingresar credenciales**: SSID y contraseña de tu red WiFi
6. **Esperar reconexión**: El ESP32 se reiniciará y conectará automáticamente

### Configuración Avanzada

### Modificar Frecuencia de Lectura

```python
# En main.py, línea 18
reading_frequency = 10000  # En milisegundos (10 segundos por defecto)

```

### Configurar Pines

```python
# En main.py, líneas 10-12
LED_PIN = 2      # Pin del LED indicador
DHT_PIN = 13     # Pin de datos del DHT22

```

## 🌐 API Endpoints del ESP32

El ESP32 expone una API RESTful accesible a través de HTTP:

### Base URL

```
http://<ESP32_IP_ADDRESS>

```

### Endpoints Disponibles

### 1. Obtener Datos del Sensor

```
GET /data

```

**Respuesta**:

```json
{
  "temperature": 25.5,
  "humidity": 60.2
}

```

### 2. Configurar Frecuencia de Lectura

```
GET /set_freq?freq=5000

```

**Parámetros**:

- `freq`: Frecuencia en milisegundos (mínimo 1000)

**Respuesta**:

```
Frecuencia de lectura actualizada a 5000 ms.

```

### 3. Estado del Servidor

```
GET /

```

**Respuesta**:

```
API RESTful ESP32 para Estacion Meteorologica

```

## 🔗 Edge Functions (API Centralizada)

### 1. `ingest.ts` - Ingesta de Datos

**Endpoint:** `POST /functions/v1/ingest`

Recibe datos de sensores ESP32 y los distribuye a ambas bases de datos.

**Request Body:**

```json
{
  "temperatura": 25.5,
  "humedad": 60.2,
  "timestamp": "2025-01-15T10:30:00Z"
}

```

**Response:**

```json
{
  "message": "Data ingested successfully",
  "timestamp": "2025-01-15T10:30:00Z",
  "temperatura": 25.5,
  "humedad": 60.2
}

```

### 2. `daily.ts` - Datos Diarios Resumidos

**Endpoint:** `GET /functions/v1/daily?fecha=YYYY-MM-DD`

Retorna datos consolidados del día desde Supabase.

**Response:**

```json
{
  "fecha": "2025-01-15",
  "promedio_temperatura": 24.8,
  "minimo_temperatura": 18.2,
  "promedio_humedad": 62.5
}

```

### 3. `historic.ts` - Datos Históricos

**Endpoint:** `GET /functions/v1/historic`

Retorna datos históricos desde InfluxDB con soporte para agregación.

**Parámetros:**

- `from` (requerido): Fecha/hora de inicio en formato ISO 8601
- `to` (requerido): Fecha/hora de fin en formato ISO 8601
- `granularity` (opcional): Nivel de agregación (`raw`, `1m`, `5m`, `15m`, `1h`, `1d`)
- `stats` (opcional): Estadísticas a calcular (`mean`, `min`, `max`)

**Ejemplos:**

```bash
# Datos crudos
GET /functions/v1/historic?from=2025-01-15T00:00:00Z&to=2025-01-16T00:00:00Z

# Promedios cada 5 minutos
GET /functions/v1/historic?from=2025-01-15T00:00:00Z&to=2025-01-16T00:00:00Z&granularity=5m

# Mínimos y máximos diarios
GET /functions/v1/historic?from=2025-01-01T00:00:00Z&to=2025-01-08T00:00:00Z&granularity=1d&stats=min,max

```

## 📁 Estructura del Proyecto

```
estacionMainFinal/
├── README.md              # Esta documentación
├── boot.py               # Inicialización y limpieza de memoria
├── main.py               # Código principal del proyecto
├── edge-functions/       # Funciones de borde Supabase
│   ├── ingest.ts        # Ingesta de datos
│   ├── daily.ts         # Datos diarios
│   └── historic.ts      # Datos históricos
├── docs/                 # Documentación adicional
│   ├── API.md           # Documentación detallada de API
│   ├── HARDWARE.md      # Guía de hardware y conexiones
│   └── ARCHITECTURE.md  # Arquitectura del sistema
├── examples/            # Ejemplos de uso
│   ├── client.py        # Cliente Python de ejemplo
│   └── dashboard.html   # Dashboard web básico
└── schemas/             # Esquemas de base de datos
    ├── supabase.sql     # Tablas para Supabase
    └── influxdb.md      # Configuración de InfluxDB

```

## 🗄️ Base de Datos

### Supabase - Tabla Resumen Diario

```sql
CREATE TABLE resumen_dia (
  fecha DATE PRIMARY KEY,
  promedio_temperatura DECIMAL(5,2) NOT NULL,
  minimo_temperatura DECIMAL(5,2) NOT NULL,
  promedio_humedad DECIMAL(5,2) NOT NULL
);

-- Habilitar RLS
ALTER TABLE resumen_dia ENABLE ROW LEVEL SECURITY;

-- Política para insertar datos
CREATE POLICY "ESP32 can insert weather data" ON resumen_dia
  FOR INSERT WITH CHECK (true);

-- Política para leer datos
CREATE POLICY "Anyone can read weather data" ON resumen_dia
  FOR SELECT USING (true);

```

### InfluxDB - Datos de Series Temporales

**Measurement:** `readings`**Fields:** `temperatura`, `humedad`

Configuración recomendada:

- **Bucket**: `weather`
- **Retention Policy**: Según requerimientos de almacenamiento
- **Precision**: `ns`

### Variables de Entorno Requeridas

Configurar en Supabase Edge Functions:

```bash
# Supabase
supabase secrets set SUPABASE_URL="<https://your-project.supabase.co>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# InfluxDB
supabase secrets set INFLUX_URL="<https://your-influx-host>"
supabase secrets set INFLUX_ORG="your_org"
supabase secrets set INFLUX_BUCKET="weather"
supabase secrets set INFLUX_TOKEN="your_token"

```

## 🎯 Uso

### Monitoreo Básico

1. **Verificar conexión**: LED encendido indica conexión WiFi exitosa
2. **Acceder a datos**: Visitar `http://<IP_ESP32>/data` en navegador
3. **Monitoreo continuo**: Los datos se actualizan cada 10 segundos por defecto

### Integración con Edge Functions

Modificar el código del ESP32 para enviar datos a las Edge Functions:

```python
import urequests
import ujson

# Configuración de Edge Functions
EDGE_FUNCTION_URL = "<https://your-project.supabase.co/functions/v1/ingest>"

def send_to_edge_function(temp, hum):
    """Envía datos a Edge Functions"""
    data = {
        'temperatura': temp,
        'humedad': hum
    }

    try:
        response = urequests.post(EDGE_FUNCTION_URL,
                                data=ujson.dumps(data),
                                headers={'Content-Type': 'application/json'})
        if response.status_code == 200:
            print("Datos enviados exitosamente")
        else:
            print(f"Error al enviar datos: {response.status_code}")
        response.close()
    except Exception as e:
        print(f"Error de conexión: {e}")

```

### Dashboard Web Básico

```html
<!DOCTYPE html>
<html>
<head>
    <title>Estación Meteorológica</title>
    <script>
        const EDGE_FUNCTION_BASE = '<https://your-project.supabase.co/functions/v1>';

        async function updateCurrentData() {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`${EDGE_FUNCTION_BASE}/daily?fecha=${today}`);
            const data = await response.json();

            document.getElementById('current-temp').innerText = data.promedio_temperatura;
            document.getElementById('current-hum').innerText = data.promedio_humedad;
            document.getElementById('min-temp').innerText = data.minimo_temperatura;
        }

        setInterval(updateCurrentData, 30000); // Actualizar cada 30 segundos
    </script>
</head>
<body>
    <h1>Estación Meteorológica ESP32</h1>
    <div>
        <h2>Datos Actuales</h2>
        <p>Temperatura Promedio: <span id="current-temp">--</span>°C</p>
        <p>Humedad Promedio: <span id="current-hum">--%</span></p>
        <p>Temperatura Mínima: <span id="min-temp">--</span>°C</p>
    </div>
</body>
</html>

```

## 🔍 Troubleshooting

### Problemas Comunes

### 1. ESP32 no se conecta al WiFi

**Síntomas**: LED parpadeando continuamente
**Soluciones**:

- Verificar credenciales WiFi
- Comprobar señal WiFi
- Reiniciar ESP32 y reconfigurar
- Verificar que la red sea 2.4GHz (ESP32 no soporta 5GHz)

### 2. Sensor DHT22 retorna valores -1.0

**Síntomas**: API devuelve `{"temperature": -1.0, "humidity": -1.0}`**Soluciones**:

- Verificar conexiones del sensor
- Comprobar alimentación (3.3V)
- Añadir resistencia pull-up de 10kΩ entre VCC y DATA
- Esperar tiempo de estabilización del sensor

### 3. Error en comunicación con Edge Functions

**Síntomas**: Timeout o errores HTTP
**Soluciones**:

- Verificar URL de Edge Functions
- Comprobar conectividad a internet del ESP32
- Revisar logs de Edge Functions en Supabase
- Verificar variables de entorno configuradas

### Comandos de Diagnóstico

### Verificar IP del ESP32

```python
import network
wlan = network.WLAN(network.STA_IF)
print(wlan.ifconfig())

```

### Test del Sensor DHT22

```python
from dht import DHT22
import machine

dht = DHT22(machine.Pin(13))
dht.measure()
print(f"Temp: {dht.temperature()}°C, Hum: {dht.humidity()}%")

```

## 📈 Extensiones Posibles

### 1. Sensores Adicionales

- **BMP280**: Presión atmosférica
- **MQ-135**: Calidad del aire
- **BH1750**: Luminosidad
- **DS18B20**: Temperatura precisión

### 2. Conectividad

- **MQTT**: Protocolo IoT para datos en tiempo real
- **LoRaWAN**: Comunicación de largo alcance
- **Bluetooth**: Configuración móvil

### 3. Mejoras de Arquitectura

- **Cache Redis**: Para consultas frecuentes
- **CDN**: Para assets estáticos del dashboard
- **Alertas**: Sistema de notificaciones por email/Telegram

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crea una rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

Para soporte y preguntas:

- Email: [bruno.fabian.capri.oficial@gmail.com](mailto:bruno.fabian.capri.oficial@gmail.com)
- Número: 343 4178190
- Discord: bruno.f.c

## 📚 Referencias

- [MicroPython ESP32 Quick Reference](https://docs.micropython.org/en/latest/esp32/quickref.html)
- [DHT22 Datasheet](https://www.sparkfun.com/datasheets/Sensors/Temperature/DHT22.pdf)
- [Supabase Documentation](https://supabase.io/docs)
- [InfluxDB Documentation](https://docs.influxdata.com/influxdb/)
- [ESP32 Pinout Reference](https://randomnerdtutorials.com/esp32-pinout-reference-gpios/)
- Ayuda crucial al inicio del proyecto Wandy Rodríguez

---

**Versión**: 2.0

**Fecha**: Septiembre 2025

**Autor**: Bruno Fabián Capri

**Estado**: Producción
