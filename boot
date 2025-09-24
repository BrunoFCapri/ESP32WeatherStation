# boot.py

import network
from time import sleep, ticks_ms
import machine

# Intenta cargar las credenciales de Wi-Fi guardadas
def load_credentials():
    try:
        with open('wifi.txt', 'r') as f:
            ssid = f.readline().strip()
            password = f.readline().strip()
            return ssid, password
    except OSError:
        return None, None

def do_connect():
    """Intenta conectar a una red Wi-Fi."""
    ssid, password = load_credentials()
    if not ssid or not password:
        return False

    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if not wlan.isconnected():
        print(f'Intentando conectar a la red: {ssid}')
        wlan.connect(ssid, password)

    max_wait = 20
    while max_wait > 0 and not wlan.isconnected():
        sleep(0.5)
        max_wait -= 1

    if wlan.isconnected():
        print('Conexión Wi-Fi exitosa en boot.py!')
        print('Configuración de red:', wlan.ifconfig())
        return True
    else:
        print("No se pudo conectar en boot.py. El control pasa a main.py.")
        return False

# Iniciar la conexión
do_connect()
