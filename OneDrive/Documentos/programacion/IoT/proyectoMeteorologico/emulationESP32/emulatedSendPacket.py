# main_emulated.py -- Script de emulación para desarrollo

import socket
import time
import json
import random

# Variables globales para simular las lecturas del sensor
temperature_value = '00'
humidity_value = '00'

# Configuración del servidor web
# Se usa 'localhost' para que el servidor sea accesible solo localmente
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(('localhost', 80))
s.listen(5)

def get_emulated_dht22_values():
    """Genera valores de temperatura y humedad aleatorios para emular el sensor."""
    global temperature_value
    global humidity_value
    
    # Simula un rango de valores de 0 a 40 para la temperatura
    temperature = random.uniform(0.0, 40.0)
    # Simula un rango de valores de 0 a 100 para la humedad
    humidity = random.uniform(0.0, 100.0)
    
    temperature_value = str(round(temperature, 1))
    humidity_value = str(round(humidity, 1))
    print(f"Valores emulados: Temp={temperature_value}°C, Hum={humidity_value}%")

def api_response():
    """Genera una respuesta JSON con los datos simulados."""
    get_emulated_dht22_values()  # Actualiza los valores antes de responder
    
    data = {
        "temperature": temperature_value,
        "humidity": humidity_value,
        "unit_temp": "C",
        "unit_hum": "%"
    }
    return json.dumps(data)

print('Servidor API RESTful de emulación iniciado en http://localhost:80. Esperando peticiones...')

while True:
    try:
        # Espera una nueva conexión
        conn, addr = s.accept()
        print(f'Conexión desde {str(addr)}')
        
        # Lee la primera línea de la petición HTTP
        request = conn.recv(1024)
        if not request:
            continue
            
        request_line = str(request).split('\\r\\n')[0]
        
        # Lógica de la API
        api_path = "/api/v1/dht_data"
        if api_path in request_line:
            response_body = api_response()
            conn.sendall(b'HTTP/1.1 200 OK\n')
            conn.sendall(b'Content-Type: application/json\n')
            conn.sendall(b'Connection: close\n\n')
            conn.sendall(response_body.encode('utf-8'))
        else:
            # Responde con un mensaje de bienvenida si la ruta es incorrecta
            conn.sendall(b'HTTP/1.1 200 OK\n')
            conn.sendall(b'Content-Type: text/plain\n')
            conn.sendall(b'Connection: close\n\n')
            conn.sendall(b'¡Hola! Esta es una API de emulacion. Usa la ruta /api/v1/dht_data para obtener los datos del sensor.')
        
        # Cierra la conexión
        conn.close()
    except Exception as e:
        print(f"Error en el servidor de emulación: {e}")