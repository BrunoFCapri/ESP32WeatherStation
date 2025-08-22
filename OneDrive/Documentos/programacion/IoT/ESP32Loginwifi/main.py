import network
import socket
from time import sleep
import machine

# Configura el LED de la placa, generalmente en el pin 2
led = machine.Pin(2, machine.Pin.OUT)

# Intenta cargar las credenciales de Wi-Fi guardadas
try:
    with open('wifi.txt', 'r') as f:
        ssid = f.readline().strip()
        password = f.readline().strip()
except OSError:
    ssid = None
    password = None

def do_connect():
    """Intenta conectar a una red Wi-Fi."""
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    
    if not wlan.isconnected():
        print('Conectando a la red...')
        try:
            wlan.connect(ssid, password)
        except OSError as e:
            print(f"Error de conexión: {e}. Volviendo a modo AP.")
            do_ap_mode("Contraseña anterior errónea")
            return False

        # Espera un máximo de 10 segundos
        max_wait = 10
        while max_wait > 0:
            if wlan.isconnected():
                print('Conexión exitosa!')
                print('Configuración de red:', wlan.ifconfig())
                led.value(1)  # Enciende el LED de forma continua
                return True
            max_wait -= 1
            led.value(not led.value())  # Parpadea el LED mientras intenta conectar
            sleep(0.5)
            print(f"Esperando conexión... {max_wait}s restantes")
            sleep(0.5)
    
    # Si la conexión falla después del tiempo de espera
    print("No se pudo conectar a la red Wi-Fi. Iniciando el punto de acceso para reconfiguración.")
    do_ap_mode("Contraseña anterior errónea")
    return False

def do_ap_mode(error_message=""):
    """Configura el ESP32 como punto de acceso y hace parpadear el LED."""
    ap = network.WLAN(network.AP_IF)
    ap.active(True)
    ap.config(essid='ESP32-CONFIG', password='micropython')
    print('Punto de acceso activado. Conectate a "ESP32-CONFIG"')
    print('Dirección IP del AP:', ap.ifconfig()[0])
    
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('', 80))
    s.listen(5)
    
    # Agrega el mensaje de error si existe
    error_html = f'<p style="color: red; font-weight: bold;">{error_message}</p>' if error_message else ""
    
    html = f"""
    <html>
        <head>
            <title>Configuración de WiFi</title>
            <style>
                body {{ font-family: sans-serif; text-align: center; }}
                input {{ padding: 10px; margin: 5px; width: 80%; }}
                button {{ padding: 10px 20px; font-size: 16px; cursor: pointer; }}
            </style>
        </head>
        <body>
            <h2>Configuración de WiFi</h2>
            {error_html}
            <form action="/config" method="get">
                <input type="text" name="ssid" placeholder="Nombre de la red (SSID)"><br>
                <input type="password" name="password" placeholder="Contraseña"><br>
                <button type="submit">Conectar</button>
            </form>
        </body>
    </html>
    """
    
    # Bucle para parpadear el LED mientras espera la configuración
    while True:
        try:
            conn, addr = s.accept()
            led.value(0) # Apaga el LED momentáneamente al recibir una conexión
            request = conn.recv(1024)
            request = str(request)
            
            if "GET /config" in request:
                ssid_start = request.find("ssid=") + 5
                ssid_end = request.find("&", ssid_start)
                new_ssid = request[ssid_start:ssid_end].replace('%20', ' ').replace('+', ' ')
                
                password_start = request.find("password=") + 9
                password_end = request.find(" ", password_start)
                new_password = request[password_start:password_end].replace('%20', ' ').replace('+', ' ')

                with open('wifi.txt', 'w') as f:
                    f.write(new_ssid + '\n')
                    f.write(new_password + '\n')
                
                print("Credenciales guardadas. Reiniciando...")
                conn.send('HTTP/1.1 200 OK\nContent-Type: text/html\n\n')
                conn.send('<h1>Conectando... Reinicia el ESP32 para aplicar los cambios.</h1>')
                conn.close()
                sleep(2)
                import machine
                machine.reset()
                
            else:
                conn.send('HTTP/1.1 200 OK\nContent-Type: text/html\n\n')
                conn.send(html)
            conn.close()
            
        except Exception as e:
            print(f"Error: {e}")
            conn.close()
            break
            
        led.value(not led.value()) # Sigue parpadeando el LED
        sleep(0.5)

# Lógica principal del programa
if ssid and password:
    if not do_connect():
        # Esta parte ya no se ejecuta, el error se maneja dentro de do_connect
        pass 
else:
    do_ap_mode()