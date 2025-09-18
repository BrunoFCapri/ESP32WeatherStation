# Estación Meteorológica ESP32 con Integración Supabase

Una estación meteorológica inteligente basada en ESP32 que lee datos de temperatura y humedad mediante un sensor DHT22 y los almacena en una base de datos Supabase. El proyecto incluye configuración WiFi automática, servidor web RESTful y portal cautivo para configuración inicial. Aclaracion tiene una pagina web operando con supabase https://clima-zero-3xlfopf5y-brunofcapris-projects.vercel.app (repo https://github.com/BrunoFCapri/ClimaZero) 

## 📋 Tabla de Contenidos

- [Características](#características)
- [Componentes de Hardware](#componentes-de-hardware)
- [Esquema de Conexión](#esquema-de-conexión)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [API Endpoints](#api-endpoints)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Base de Datos Supabase](#base-de-datos-supabase)
- [Uso](#uso)
- [Troubleshooting](#troubleshooting)

## 🚀 Características

- **Lectura de Sensores**: Monitoreo continuo de temperatura y humedad con sensor DHT22
- **Conectividad WiFi**: Conexión automática a redes WiFi con portal de configuración
- **API RESTful**: Endpoints HTTP para acceso a datos y configuración
- **Portal Cautivo**: Interfaz web para configurar credenciales WiFi
- **Integración Supabase**: Preparado para envío de datos a base de datos en la nube
- **Indicadores LED**: Estado visual de conexión y operación
- **Frecuencia Configurable**: Ajuste dinámico de la frecuencia de lectura de sensores

## 🔧 Componentes de Hardware

### Requisitos

| Componente | Cantidad | Descripción |
|------------|----------|-------------|
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

#### Modificar Frecuencia de Lectura

```python
# En main.py, línea 18
reading_frequency = 10000  # En milisegundos (10 segundos por defecto)
```

#### Configurar Pines

```python
# En main.py, líneas 10-12
LED_PIN = 2      # Pin del LED indicador
DHT_PIN = 13     # Pin de datos del DHT22
```

## 🌐 API Endpoints

El ESP32 expone una API RESTful accesible a través de HTTP:

### Base URL
```
http://<ESP32_IP_ADDRESS>
```

### Endpoints Disponibles

#### 1. Obtener Datos del Sensor
```http
GET /data
```

**Respuesta**:
```json
{
  "temperature": 25.5,
  "humidity": 60.2
}
```

#### 2. Configurar Frecuencia de Lectura
```http
GET /set_freq?freq=5000
```

**Parámetros**:
- `freq`: Frecuencia en milisegundos (mínimo 1000)

**Respuesta**:
```
Frecuencia de lectura actualizada a 5000 ms.
```

#### 3. Estado del Servidor
```http
GET /
```

**Respuesta**:
```
API RESTful ESP32 para Estacion Meteorologica
```

### Ejemplos de Uso

#### Python
```python
import requests

# Obtener datos
response = requests.get('http://192.168.1.100/data')
data = response.json()
print(f"Temperatura: {data['temperature']}°C")
print(f"Humedad: {data['humidity']}%")

# Cambiar frecuencia
requests.get('http://192.168.1.100/set_freq?freq=30000')
```

#### JavaScript
```javascript
// Obtener datos
fetch('http://192.168.1.100/data')
  .then(response => response.json())
  .then(data => {
    console.log(`Temperatura: ${data.temperature}°C`);
    console.log(`Humedad: ${data.humidity}%`);
  });
```

#### cURL
```bash
# Obtener datos
curl http://192.168.1.100/data

# Configurar frecuencia
curl "http://192.168.1.100/set_freq?freq=15000"
```

## 📁 Estructura del Proyecto

```
estacionMainFinal/
├── README.md              # Esta documentación
├── boot.py               # Inicialización y limpieza de memoria
├── main.py               # Código principal del proyecto
├── docs/                 # Documentación adicional
│   ├── API.md           # Documentación detallada de API
│   ├── HARDWARE.md      # Guía de hardware y conexiones
│   └── SUPABASE.md      # Configuración de Supabase
├── examples/            # Ejemplos de uso
│   ├── client.py        # Cliente Python de ejemplo
│   └── dashboard.html   # Dashboard web básico
└── schemas/             # Esquemas de base de datos
    └── weather_data.sql # Tabla para Supabase
```

## 🗄️ Base de Datos Supabase

### Configuración de Tabla

Crear tabla en Supabase para almacenar datos meteorológicos:

```sql
CREATE TABLE weather_data (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL DEFAULT 'esp32_station',
  temperature DECIMAL(5,2) NOT NULL,
  humidity DECIMAL(5,2) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location TEXT DEFAULT NULL,
  battery_level DECIMAL(5,2) DEFAULT NULL
);

-- Crear índice para optimizar consultas por tiempo
CREATE INDEX idx_weather_timestamp ON weather_data(timestamp DESC);

-- Crear índice para device_id
CREATE INDEX idx_weather_device ON weather_data(device_id);
```

### Configuración de Seguridad RLS (Row Level Security)

```sql
-- Habilitar RLS
ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;

-- Política para insertar datos (ESP32)
CREATE POLICY "ESP32 can insert weather data" ON weather_data
  FOR INSERT WITH CHECK (true);

-- Política para leer datos (aplicaciones)
CREATE POLICY "Anyone can read weather data" ON weather_data
  FOR SELECT USING (true);
```

### Integración con ESP32

Para integrar con Supabase, añadir estas funciones al `main.py`:

```python
import urequests
import ujson

# Configuración de Supabase
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-anon-key"
SUPABASE_TABLE = "weather_data"

def send_to_supabase(temp, hum):
    """Envía datos a Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }
    
    data = {
        'temperature': temp,
        'humidity': hum,
        'device_id': 'esp32_station_01'
    }
    
    try:
        response = urequests.post(url, 
                                data=ujson.dumps(data), 
                                headers=headers)
        if response.status_code == 201:
            print("Datos enviados a Supabase exitosamente")
        else:
            print(f"Error al enviar datos: {response.status_code}")
        response.close()
    except Exception as e:
        print(f"Error de conexión con Supabase: {e}")
```

## 🎯 Uso

### Monitoreo Básico

1. **Verificar conexión**: LED encendido indica conexión WiFi exitosa
2. **Acceder a datos**: Visitar `http://<IP_ESP32>/data` en navegador
3. **Monitoreo continuo**: Los datos se actualizan cada 10 segundos por defecto

### Dashboard Web Básico

Crear un archivo HTML para visualización:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Estación Meteorológica</title>
    <script>
        async function updateData() {
            const response = await fetch('http://ESP32_IP/data');
            const data = await response.json();
            document.getElementById('temp').innerText = data.temperature;
            document.getElementById('hum').innerText = data.humidity;
        }
        
        setInterval(updateData, 5000); // Actualizar cada 5 segundos
    </script>
</head>
<body>
    <h1>Estación Meteorológica ESP32</h1>
    <p>Temperatura: <span id="temp">--</span>°C</p>
    <p>Humedad: <span id="hum">--%</span></p>
</body>
</html>
```

### Aplicación Python de Monitoreo

```python
import requests
import time
import matplotlib.pyplot as plt
from datetime import datetime

class WeatherMonitor:
    def __init__(self, esp32_ip):
        self.base_url = f"http://{esp32_ip}"
        self.temperatures = []
        self.humidities = []
        self.timestamps = []
    
    def get_data(self):
        """Obtiene datos del ESP32"""
        try:
            response = requests.get(f"{self.base_url}/data", timeout=5)
            if response.status_code == 200:
                return response.json()
        except requests.RequestException as e:
            print(f"Error getting data: {e}")
        return None
    
    def log_data(self):
        """Registra datos con timestamp"""
        data = self.get_data()
        if data:
            self.temperatures.append(data['temperature'])
            self.humidities.append(data['humidity'])
            self.timestamps.append(datetime.now())
            print(f"{datetime.now()}: {data['temperature']}°C, {data['humidity']}%")
    
    def plot_data(self):
        """Genera gráficos de los datos"""
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8))
        
        # Gráfico de temperatura
        ax1.plot(self.timestamps, self.temperatures, 'r-', label='Temperatura')
        ax1.set_ylabel('Temperatura (°C)')
        ax1.set_title('Datos Meteorológicos ESP32')
        ax1.grid(True)
        ax1.legend()
        
        # Gráfico de humedad
        ax2.plot(self.timestamps, self.humidities, 'b-', label='Humedad')
        ax2.set_ylabel('Humedad (%)')
        ax2.set_xlabel('Tiempo')
        ax2.grid(True)
        ax2.legend()
        
        plt.tight_layout()
        plt.show()

# Uso
monitor = WeatherMonitor("192.168.1.100")
for _ in range(60):  # Monitorear por 1 hora
    monitor.log_data()
    time.sleep(60)  # Cada minuto

monitor.plot_data()
```

## 🔍 Troubleshooting

### Problemas Comunes

#### 1. ESP32 no se conecta al WiFi

**Síntomas**: LED parpadeando continuamente
**Soluciones**:
- Verificar credenciales WiFi
- Comprobar señal WiFi
- Reiniciar ESP32 y reconfigurar
- Verificar que la red sea 2.4GHz (ESP32 no soporta 5GHz)

#### 2. Sensor DHT22 retorna valores -1.0

**Síntomas**: API devuelve `{"temperature": -1.0, "humidity": -1.0}`
**Soluciones**:
- Verificar conexiones del sensor
- Comprobar alimentación (3.3V)
- Añadir resistencia pull-up de 10kΩ entre VCC y DATA
- Esperar tiempo de estabilización del sensor

#### 3. No se puede acceder a la API

**Síntomas**: Timeout o conexión rechazada
**Soluciones**:
- Verificar que ESP32 esté conectado a WiFi (LED encendido)
- Comprobar IP asignada al ESP32
- Verificar firewall en red local
- Reiniciar ESP32

#### 4. Portal cautivo no aparece

**Síntomas**: No se encuentra red ESP32-CONFIG
**Soluciones**:
- Mantener presionado botón Boot durante arranque
- Borrar archivo `wifi.txt` si existe
- Verificar que no hay otras redes con mismo nombre

### Comandos de Diagnóstico

#### Verificar IP del ESP32
```python
import network
wlan = network.WLAN(network.STA_IF)
print(wlan.ifconfig())
```

#### Test del Sensor DHT22
```python
from dht import DHT22
import machine

dht = DHT22(machine.Pin(13))
dht.measure()
print(f"Temp: {dht.temperature()}°C, Hum: {dht.humidity()}%")
```

#### Monitor Serial
```bash
# Usando PuTTY, screen, o minicom
screen /dev/ttyUSB0 115200  # Linux/Mac
# O usar Thonny para monitor integrado
```

### Códigos de Error

| Código | Descripción | Solución |
|--------|-------------|----------|
| OSError 5 | Error de E/O del sensor | Verificar conexiones |
| OSError 113 | Host inalcanzable | Verificar conectividad |
| MemoryError | Memoria insuficiente | Reiniciar ESP32 |
| ValueError | Parámetro inválido | Verificar formato de datos |

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

### 3. Almacenamiento
- **SD Card**: Respaldo local de datos
- **SPIFFS**: Sistema de archivos interno
- **Buffer circular**: Para datos offline

### 4. Alimentación
- **Panel solar**: Alimentación sostenible
- **Batería LiPo**: Operación autónoma
- **Monitor de batería**: Estado energético

### 5. Interfaz
- **Display OLED**: Visualización local
- **App móvil**: Control remoto
- **Telegram Bot**: Notificaciones

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

- Email: bruno.fabian.capri.oficial@gmail.com
- Número: 343 4178190 

## 📚 Referencias

- [MicroPython ESP32 Quick Reference](https://docs.micropython.org/en/latest/esp32/quickref.html)
- [DHT22 Datasheet](https://www.sparkfun.com/datasheets/Sensors/Temperature/DHT22.pdf)
- [Supabase Documentation](https://supabase.io/docs)
- [ESP32 Pinout Reference](https://randomnerdtutorials.com/esp32-pinout-reference-gpios/)

---

**Versión**: 1.0  
**Fecha**: Septiembre 2025  
**Autor**: Bruno Fabián Capri

**Estado**: Producción
