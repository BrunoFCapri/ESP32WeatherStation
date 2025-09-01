Servidor Web y API RESTful para Sensor DHT22 en ESP32
Descripción del Proyecto
Este proyecto es una solución integral que combina un portal de configuración Wi-Fi con un servidor web y una API RESTful. Utiliza un microcontrolador ESP32 para leer datos de temperatura y humedad de un sensor DHT22 y exponerlos a través de una API para que cualquier dispositivo en la misma red pueda consultarlos.

El sistema está diseñado para ser completamente autónomo. Si la ESP32 no encuentra una red Wi-Fi conocida, activa automáticamente un portal cautivo para que el usuario pueda ingresar las credenciales de la red de forma sencilla desde cualquier navegador.

Características
API RESTful: Expone los datos del sensor de temperatura y humedad en formato JSON a través de un endpoint (/api/datos). Esto permite una comunicación eficiente y estructurada con otros dispositivos.

Portal Cautivo: Inicia un servidor web y un servidor DNS para redirigir automáticamente a los usuarios a la página de configuración de Wi-Fi.

Gestión de Credenciales: Guarda las credenciales de Wi-Fi en un archivo de texto (wifi.txt) para reconexiones futuras.

Indicador Visual: Utiliza el LED integrado de la placa para mostrar el estado de la conexión:

Parpadea: Intentando conectar.

Encendido fijo: Conexión exitosa.

Manejo de Errores: En caso de fallos de conexión, vuelve automáticamente al modo de portal cautivo.

Ciclo de vida 
Objetos singleton para los recursos que deben existir de forma permanente (los pines, el sensor, el servidor).

Objetos transient para los recursos que solo se necesitan brevemente (las conexiones de red).

Conceptos Técnicos Clave
API RESTful
La API RESTful define un conjunto de reglas que permite a los programas de software comunicarse entre sí a través de Internet. En este proyecto, tu ESP32 actúa como un servidor y cualquier dispositivo que pida datos (por ejemplo, tu teléfono o computadora) actúa como un cliente. La petición se hace a una dirección específica (/api/datos), y la respuesta es un paquete de datos en formato JSON que contiene la temperatura y la humedad.

JSON
JSON (JavaScript Object Notation) es un formato ligero para el intercambio de datos. Es fácil de leer y escribir para los humanos y fácil de analizar y generar para las máquinas. Es ideal para este tipo de proyectos porque es muy eficiente y es un estándar de facto en las APIs web.

Servidor Web y DNS
El servidor web es el que muestra la página HTML del portal de configuración. El servidor DNS es la "magia" que hace que el portal sea cautivo. Cuando te conectas a la ESP32, cualquier nombre de dominio que intentes visitar es interceptado por el servidor DNS y redirigido a la página de configuración de la placa.

Requisitos
Placa de desarrollo ESP32 o ESP32-S2/S3.

Firmware MicroPython instalado en la placa.

Sensor de temperatura y humedad DHT22.

Herramienta de flasheo esptool.py y herramienta de gestión de archivos ampy.

Instalación y Uso
Sigue estos pasos para poner en marcha el proyecto:

1. Preparar el Firmware
Si aún no lo has hecho, borra la memoria de la placa y flashea el firmware más reciente de MicroPython para ESP32.

Borrar memoria:

python -m esptool --port COM6 erase_flash

Flashear firmware:
(Reemplaza el nombre del archivo con el que descargaste)

python -m esptool --port COM6 --baud 460800 write_flash -z 0x1000 ESP32_GENERIC-YYYYMMDD-vX.Y.Z.bin

2. Subir el Código
Sube ambos archivos, boot.py y main.py, a tu placa usando ampy.

ampy --port COM6 put boot.py
ampy --port COM6 put main.py

3. Funcionamiento
Conecta el sensor DHT22 a tu ESP32.

La ESP32 se encenderá y el boot.py intentará conectar a la red preconfigurada.

Si la conexión falla, el main.py se ejecutará y la ESP32 iniciará un punto de acceso llamado "ESP32-CONFIG".

Conecta tu teléfono o computadora a esa red Wi-Fi. La notificación de portal cautivo te redirigirá a la página de configuración.

Una vez conectado, el servidor web y la API estarán activos en la dirección IP de la placa.

Estructura del Proyecto
boot.py: Script de inicio que intenta una conexión a una red predefinida.

main.py: Código principal que gestiona el punto de acceso, el servidor web, el servidor DNS y la lectura del sensor, activándose solo si el boot.py no tiene éxito.

wifi.txt: Archivo de texto que almacena las credenciales de Wi-Fi.

