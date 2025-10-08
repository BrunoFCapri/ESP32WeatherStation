# Arquitectura y Seguridad IoT (Supabase + Edge + Firmware ESP32)

## 1. Situación Actual

### 1.1 Ingesta (Edge Function actual)
- Recibe POST con { temperatura, humedad, timestamp? }.
- Usa SERVICE ROLE KEY en el Edge (correcto) pero la placa envía directo a REST con una API key (incorrecto).
- No autentica dispositivo → cualquiera que descubra la URL puede insertar.
- Agregación diaria incorrecta (upsert que sobrescribe promedio sin acumulación robusta).
- No se valida:
  - Identidad / integridad.
  - Rango de valores.
  - Tamaño de cuerpo.
  - Replays / duplicados / flooding.
  - Deriva temporal (timestamp drift).

### 1.2 Firmware (ESP32 / MicroPython)
- Usa anon/service key para POST directo a /rest/v1/readings (exposición crítica).
- No firma datos.
- Sin device_id persistente ni rotación de credenciales.
- Portal AP sólo configura Wi‑Fi (no provisioning seguro).
- Sin manejo de reloj (depende de ticks, potencial drift).

### 1.3 App Flutter (DeviceService / HeartbeatService)
- Pensado para móviles: genera device_id + par Ed25519 y registra en tabla dispositivousuario.
- Heartbeat intenta Edge; fallback directo a tabla; auto‑registra si no existe.
- Cache activo sin TTL definido.
- Semántica centrada en usuario + aprobación manual.

### 1.4 Riesgos
| Riesgo | Impacto |
|--------|---------|
| Clave expuesta en firmware | Compromiso total BD (SERVICE o ANON) |
| No autenticación de dispositivos | Inyección datos falsos / DoS |
| Falta anti‑replay | Reenvío viejo manipula agregados |
| Sin rate limiting | Saturación recursos (Influx, DB) |
| Agregación no atómica | Datos inconsistentes / promedios incorrectos |
| Sin limpieza nonces / logs | Crecimiento almacenamiento |
| Ausencia rotación secretos | Persistencia tras filtración |
| Fallback silencioso en heartbeat | Estados incoherentes |

---

## 2. Objetivos Diseño IoT

1. Identidad fuerte por dispositivo (clave o secreto único).
2. Eliminación de API keys (anon/service) en el firmware.
3. Firma/HMAC de cada mensaje (integridad + autenticidad).
4. Anti‑replay: nonce único + ventana temporal.
5. Revocación inmediata (status=disabled).
6. Agregación diaria consistente (sum/count/min → promedio derivado).
7. Observabilidad (last_seen_at, métricas).
8. Escalabilidad: limpieza nonces y limites de tamaño/rate.
9. Camino de migración gradual sin cortar móviles existentes.

---

## 3. Opciones de Autenticación

| Método | Pros | Contras | Recomendación Inicial |
|--------|------|---------|-----------------------|
| HMAC-SHA256 con secreto 32B | Simple, rápido, ligero en MicroPython | Necesitas proteger secreto (no hardware secure) | Fase 1 |
| Ed25519 firma | No compartes secreto, rotación más limpia | Libs + coste CPU | Fase 2 (si se exige no divulgación secreto) |
| MTLS / certificados | Fuerte | Complejo + peso | No ahora |

---

## 4. Esquema de Datos (Propuesto)

Tablas nuevas / revisadas:

device_auth  
- device_id (text PK)  
- secret_b64 (text)  (o public_key si Ed25519)  
- status (active|pending|disabled)  
- firmware_version  
- last_seen_at timestamptz  
- created_at timestamptz default now()  

device_nonce  
- device_id  
- nonce  
- created_at  
PRIMARY KEY (device_id, nonce)

resumen_dia  
- fecha date PK  
- sum_temp double precision  
- sum_hum double precision  
- count bigint  
- min_temp double precision (nullable)

RPC upsert_resumen_dia (INSERT ... ON CONFLICT DO UPDATE sum/count/min).

(Ver migraciones sugeridas en respuesta anterior.)

---

## 5. Edge Functions

### 5.1 ingest (nueva versión)
Validaciones:
- Headers: X-Device-Id, X-Timestamp, X-Nonce, X-Signature.
- Deriva temporal ±5m.
- Insert nonce → UNIQUE; conflicto = replay.
- Cuerpo < 8 KB.
- Campos numéricos en rango plausible (-40..125, 0..100).
- Firma = HMAC(secret, canonical(payload)|timestamp|nonce).
- Escritura Influx con tag device.
- RPC agregación día.
- Actualiza last_seen_at.

### 5.2 heartbeat (opcional)
- Verifica firma corta (sin payload grande).
- Devuelve status + política (p.ej. interval sugerido).
- Permite detectar disabled rápido.

---

## 6. Firmware (MicroPython) Cambios

1. Almacenar device_id + secret_b64url en device.cfg (provisioning fuera de Git).
2. Implementar HMAC (ya provisto en ejemplo).
3. Generar timestamp ISO (sin RTC exacto: usar NTP simple al boot o server echo).
4. Generar nonce aleatorio (8–12 bytes → hex/base64url).
5. Incluir encabezados y POST → /functions/v1/ingest.
6. Retries exponenciales si error de red.
7. Rotación: guardar secret_old + secret_new (aceptar ambos durante ventana).

---

## 7. HeartbeatService / DeviceService (Flutter) Ajustes

Problema: Lógica app móvil mezcla modelo “aprobación manual” con posible futura capa IoT.

Acciones:
- Introducir TTL cache (ej. 10 min).
- No auto‑registrar en fallback silencioso → retornar null y avisar UI.
- Registrar métricas de fallas (para debug).
  
Ejemplo (añadir TTL) ya sugerido previamente:
```dart
// ...existing code...
static const _cacheTtl = Duration(minutes: 10);
bool? get cachedStatus {
  if (_lastCheckedAt != null &&
      DateTime.now().difference(_lastCheckedAt!) > _cacheTtl) {
    return null;
  }
  return _lastStatus;
}
```

Migración de tabla dispositivousuario → device_auth (alias o VIEW temporal):
- Crear vista compat con columnas esperadas mientras migras Flutter.

---

## 8. Seguridad y RLS

- device_auth: RLS habilitado; SELECT para dueño (si aplica a usuarios finales; Edge con service role ignora RLS).
- device_nonce: no necesita acceso desde cliente → sólo Edge (puede omitirse RLS).
- resumen_dia: acceso lectura agregada; escritura sólo vía RPC (SECURITY DEFINER).

Política ejemplo:
```sql
alter table public.device_auth enable row level security;
create policy device_auth_owner_select
on public.device_auth for select
using (auth.uid() = (select user_id from user_device_map where device_id = device_auth.device_id));
```
(O usar join / denormalizar user_id si hay dueño lógico.)

---

## 9. Anti‑Abuso

Mecanismos:
- Rate limit por IP o device_id (Cloudflare / nginx / Deno KV contador simple).
- Tamaño máximo body.
- TTL de nonces (delete > 24h).
- Monitor anómalo: número de nonces/min > threshold → marcar device sospechoso → status=disabled.

---

## 10. Observabilidad

Campos / logs:
- device_id, status, latency_ms, result_code (ok, bad_signature, replay, drift, out_of_range).
- Métricas agregadas (Prometheus si integras gateway o logs parseables).

Alertas:
- Dispositivos sin heartbeat > X min.
- Errores bad_signature > N consecutivos.
- Porcentaje de ingest fallidas > Y%.

---

## 11. Plan de Migración

Fase | Acción | Riesgo | Mitigación
-----|--------|--------|-----------
1 | Crear tablas nuevas + RPC + ingest segura en paralelo | Bajo | No cortar endpoints viejos
2 | Generar secrets para lote piloto, cargar en firmware | Medio | Reversion mantendo firmware viejo
3 | Publicar nueva ingest y actualizar DNS/URL en firmware piloto | Bajo | Toggle feature flag
4 | Deshabilitar escritura directa /rest/v1/readings | Medio | Monitoreo antes corte
5 | Migrar móviles a vista (si comparten recursos) | Bajo | Test stage
6 | Limpieza código legacy + eliminar claves en firmware | Bajo | Auditoría final

Rollback sencillo: revertir DNS/endpoint a versión vieja mientras no se borra tabla antigua.

---

## 12. Rotación de Secretos

Procedimiento:
1. Generar secret_new (32B).
2. Guardar en tabla columnas: secret_current, secret_next, rotate_until.
3. Edge:
   - Si firma válida con current → ok.
   - Si falla, probar con next (si now <= rotate_until).
4. Tras ventana, promover secret_next → secret_current; null secret_next.

---

## 13. Threat Model (Resumen)

Amenaza | Vectores | Mitigación
--------|----------|-----------
Suplantación dispositivo | Peticiones sin firma | HMAC/Ed25519
Replay | Reenvío paquete antiguo | Nonce + timestamp drift
Robo de secreto | Dump flash | Rotación + posible Ed25519 + ofuscación ligera
DoS lógico | Flood requests | Rate limiting / tamaño / validaciones tempranas
Manipulación datos | Valores fuera rango | Validar rangos
Escalada privilegios | Uso de service key expuesta | Nunca en firmware
Inyección SQL | Cuerpo malicioso | Supabase client paramétrico (OK)
Crecimiento nonces | Inserciones infinitas | TTL + purge job

---

## 14. Checklist Operativa

Estado | Ítem
-------|-----
[ ] Tablas device_auth, device_nonce, resumen_dia creadas
[ ] RPC upsert_resumen_dia deploy
[ ] Edge ingest (segura) deploy
[ ] Firmware actualizado (HMAC)
[ ] Secrets generados y cargados
[ ] Limpieza nonces cron (daily)
[ ] Rate limiting implementado
[ ] Logs estructurados
[ ] Monitoreo/alertas básicas
[ ] Documentación rotación secretos
[ ] Vista compat para móviles (si aplica)
[ ] Eliminado uso de anon/service key en firmware

---

## 15. Próximos Pasos Opcionales

- Migrar a Ed25519 cuando se precise no compartir secreto.
- Añadir compresión (CBOR) si ancho de banda crítico.
- Implementar batch upload (buffer local si sin conexión).
- Añadir integridad secuencial (counter) opcional para detectar pérdidas.

---

## 16. Resumen Ejecutivo

Se reemplaza el envío directo con API key por un modelo de autenticación por dispositivo (HMAC inicialmente), con firma de cada mensaje, anti‑replay, agregación atómica y revocación central. Se introducen tablas específicas, nueva Edge Function con validaciones y se prepara camino para rotación y ampliación futura (Ed25519). Se reduce superficie de ataque y se mejora trazabilidad y confiabilidad de los datos de sensores.

Fin.
