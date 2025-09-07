Documentación del Proyecto: Estación Meteorológica con ESP32 y Supabase
Este documento detalla el funcionamiento y la estructura del código de tu proyecto de estación meteorológica, diseñado para ser robusto y fácil de usar.

1. Resumen del Proyecto
El proyecto consiste en una estación meteorológica autónoma basada en un microcontrolador ESP32 que mide la temperatura y la humedad. Su principal característica es un sistema de autoconfiguración de red (portal cautivo) que le permite conectarse a cualquier red Wi-Fi sin necesidad de modificar el código. Una vez conectado, el dispositivo envía automáticamente los datos del sensor a una base de datos en la nube Supabase para su almacenamiento y posterior visualización.

2. Componentes y Requerimientos
Hardware:

Microcontrolador ESP32 (con soporte para MicroPython).

Sensor de temperatura y humedad DHT22.

Cables de conexión y una protoboard.

Software:

MicroPython firmware instalado en el ESP32.

Librería urequests instalada en la placa para gestionar las peticiones HTTP.

Un proyecto en Supabase con una tabla configurada para recibir los datos.

3. Estructura del Código
El proyecto está organizado en dos archivos principales, que se ejecutan en secuencia cuando la ESP32 se enciende.

boot.py: Es el primer script que se ejecuta. Su única función es intentar conectar la ESP32 a una red Wi-Fi guardada en el archivo wifi.txt. Si la conexión es exitosa, el control pasa a main.py. Si no lo es, main.py se encargará de resolver el problema.

main.py: Este es el programa principal. Contiene toda la lógica del proyecto, incluyendo el portal cautivo, la lectura del sensor y el envío de datos a la base de datos de Supabase.

4. Flujo de Operación
Inicio y Conexión (boot.py): Cuando la ESP32 se enciende, boot.py lee las credenciales de red del archivo wifi.txt y, si existen, intenta conectarse. El LED integrado parpadea durante este proceso.

Gestión de la Red (main.py): Si la conexión no se pudo establecer en el paso anterior (porque es la primera vez que se configura, o las credenciales son incorrectas), el main.py entra en modo de punto de acceso.

Crea una red Wi-Fi llamada ESP32-CONFIG.

Al conectarte a esta red, se abrirá un portal cautivo en tu navegador para que ingreses el nombre y la contraseña de tu red Wi-Fi.

Una vez que guardes las credenciales, el ESP32 se reiniciará para intentar conectarse.

Lectura y Envío de Datos (main.py): Una vez que el ESP32 está conectado a la red, el programa entra en su ciclo principal (while True).

Cada 5 minutos (o el intervalo configurado en reading_frequency), lee la temperatura y la humedad del sensor DHT22.

Construye una petición HTTP POST con los datos en formato JSON.

Envía la petición a tu URL de Supabase, utilizando la clave de API para la autenticación.

Muestra el código de respuesta HTTP en la consola (201 si fue exitoso, 401 si falló la autenticación).

Servidor Web Local (main.py): Mientras el ESP32 está funcionando, mantiene un pequeño servidor web. Al acceder a la dirección IP de tu ESP32 desde un navegador (ej. http://192.168.0.219/data), el dispositivo responderá con la última lectura del sensor en formato JSON.

5. Configuración y Mantenimiento
Credenciales Wi-Fi: Las credenciales de tu red se guardan automáticamente en el archivo wifi.txt después de la primera configuración a través del portal cautivo. No necesitas editarlas directamente en el código.

Clave de Supabase: Asegúrate de que la clave (supabase_key) en main.py sea idéntica a la anon public key de tu proyecto de Supabase.

Permisos de Supabase: Como vimos, es crucial que la política de seguridad (RLS) de tu tabla readings permita la operación INSERT para el rol anon.

Librerías: Para que el proyecto funcione, debes instalar la librería urequests en tu ESP32.

6. Solución de Problemas Comunes
Error 401: La clave de API es incorrecta o la política de seguridad en Supabase no permite al usuario anónimo insertar datos. Revisa ambos puntos en tu panel de control de Supabase.

El LED no deja de parpadear: El ESP32 no pudo conectarse a la red guardada en wifi.txt. Esto indica que la contraseña cambió o que el router está fuera de alcance. Reinicia la placa y el portal cautivo se activará para que puedas reconfigurar la conexión.

No se envían datos: Verifica que el reading_frequency no sea demasiado largo y que no haya errores de lectura del sensor. Si los datos del sensor son -1.0, indica que hubo un error al leerlos.
