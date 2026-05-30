/*
 * GreenExtrude ESP32 — Device Simulator & Controller
 * ==================================================
 * Designed for testing without hardware sensors connected.
 * Generates realistic telemetry data and sends it to the MQTT broker.
 * Handles incoming control commands (SET_TEMPERATURE, EMERGENCY_STOP, etc.) from the server.
 *
 * Required Libraries (Install via Arduino Library Manager):
 *   - PubSubClient  (by Nick O'Leary)
 *   - ArduinoJson   (by Benoit Blanchon)
 *
 * Update WiFi and MQTT configurations below.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── WiFi Settings ───
#define WIFI_SSID     "WIFI_SSID"
#define WIFI_PASSWORD "WIFI_PASSWORD"

// ─── MQTT Settings ───
// Server IP address running the MQTT broker (must be on the same local network)
#define MQTT_BROKER   "MQTT_BROKER"
#define MQTT_PORT     1883
#define DEVICE_ID     "esp32-fake-01"

// ─── MQTT Topics (Matches shared/types.ts) ───
#define TOPIC_TELEMETRY  "greenextrude/telemetry"
#define TOPIC_COMMAND    "greenextrude/command"
#define TOPIC_STATUS     "greenextrude/status"

// ─── Timing Configurations ───
#define TELEMETRY_INTERVAL_MS  1000   // Send telemetry every 1 second
#define RECONNECT_DELAY_MS     5000   // Delay before retrying connections

// ─── Simulated System State ───
struct SimState {
  float heater_1;        // °C — feed zone
  float heater_2;        // °C — melt zone
  float heater_3;        // °C — nozzle zone
  float motor_speed;     // RPM
  float filament_dia;    // mm
  float winder_speed;    // RPM
  bool  running;
};

SimState state = {
  180.0,   // heater_1
  200.0,   // heater_2
  195.0,   // heater_3
  30.0,    // motor_speed
  2.85,    // filament_dia
  25.0,    // winder_speed
  true     // running
};

// ─── Offline Data Tampon (Store and Forward Queue) ───
struct BufferedTelemetry {
  float heater_1;
  float heater_2;
  float heater_3;
  float motor_speed;
  float filament_diameter;
  float winder_speed;
  unsigned long timestamp_ms;
};

#define BUFFER_SIZE 300
BufferedTelemetry telemetryBuffer[BUFFER_SIZE];
int bufferHead = 0;
int bufferTail = 0;
int bufferCount = 0;

void pushToBuffer(BufferedTelemetry data) {
  if (bufferCount >= BUFFER_SIZE) {
    // Buffer is full. Overwrite the oldest data (Circular Ring Buffer)
    bufferTail = (bufferTail + 1) % BUFFER_SIZE;
    bufferCount--;
  }
  telemetryBuffer[bufferHead] = data;
  bufferHead = (bufferHead + 1) % BUFFER_SIZE;
  bufferCount++;
}

bool popFromBuffer(BufferedTelemetry &data) {
  if (bufferCount == 0) {
    return false;
  }
  data = telemetryBuffer[bufferTail];
  bufferTail = (bufferTail + 1) % BUFFER_SIZE;
  bufferCount--;
  return true;
}

// ─── Anomaly Injection Settings ───
#define ANOMALY_CHANCE  0.08   // 8% chance to inject an abnormal sensor value

// ─── LED Status Indicator ───
// BUILT-IN LED (GPIO2) — solid when MQTT connected, blinks when offline
#define LED_BUILTIN  2

// ─── Global Objects ───
WiFiClient espClient;
PubSubClient mqtt(espClient);
unsigned long lastTelemetryMs = 0;
unsigned long lastReconnectAttemptMs = 0;
unsigned long lastSuccessfulPublishMs = 0;  // LED indicator timestamp

// ═══════════════════════════════════════════════════════
//  Hardware & Sensor Interface Layer
// ═══════════════════════════════════════════════════════

#define USE_REAL_SENSORS  0  // 1: Use physical sensors/pins, 0: Use simulated fake data

// Define your physical pins and sensor objects here
#if USE_REAL_SENSORS
  // Example: #define HEATER_1_PIN A0
  // Example: #define MOTOR_PWM_PIN 5
  // Include sensor libraries here (Example: #include <MAX6675.h>)
#endif

void initHardware() {
#if USE_REAL_SENSORS
  // TODO: Configure your pin modes and initialize sensor libraries here
  // Example: pinMode(MOTOR_PWM_PIN, OUTPUT);
  // Example: thermocouple.begin();
  Serial.println("[HARDWARE] Real sensors and hardware interfaces initialized.");
#else
  Serial.println("[HARDWARE] Simulation mode active. No physical pins initialized.");
#endif
}

float readHeaterTemperature(int zone) {
#if USE_REAL_SENSORS
  // TODO: Implement physical temperature reading here (e.g., thermocouple)
  // Example:
  // if (zone == 1) return thermocouple1.readCelsius();
  // if (zone == 2) return thermocouple2.readCelsius();
  // if (zone == 3) return thermocouple3.readCelsius();
  return 0.0;
#else
  // Simulated data with noise and occasional anomalies
  if (zone == 1) return maybeAnomaly(addNoise(state.heater_1, 3.0), state.heater_1, 245, 50);
  if (zone == 2) return maybeAnomaly(addNoise(state.heater_2, 2.0), state.heater_2, 250, 40);
  if (zone == 3) return maybeAnomaly(addNoise(state.heater_3, 2.5), state.heater_3, 240, 55);
  return 0.0;
#endif
}

float readMotorSpeed() {
#if USE_REAL_SENSORS
  // TODO: Read extruder motor speed using an encoder or Hall effect sensor
  return 0.0;
#else
  return maybeAnomaly(addNoise(state.motor_speed, 1.0), state.motor_speed, 80, 0);
#endif
}

float readFilamentDiameter() {
#if USE_REAL_SENSORS
  // TODO: Read physical filament diameter sensor value
  return 0.0;
#else
  return maybeAnomaly(addNoise(state.filament_dia, 0.08), state.filament_dia, 3.25, 2.50);
#endif
}

float readWinderSpeed() {
#if USE_REAL_SENSORS
  // TODO: Read winder motor speed using an encoder
  return 0.0;
#else
  return maybeAnomaly(addNoise(state.winder_speed, 0.5), state.winder_speed, 70, 0);
#endif
}

// ─── Actuator / Control Output Actions ───

void controlHeater(int zone, float targetValue) {
#if USE_REAL_SENSORS
  // TODO: Implement heater output control logic (e.g., PWM, Solid State Relay, or PID)
#else
  if (zone == 1) state.heater_1 = targetValue;
  if (zone == 2) state.heater_2 = targetValue;
  if (zone == 3) state.heater_3 = targetValue;
#endif
}

void controlMotorSpeed(float speedValue) {
#if USE_REAL_SENSORS
  // TODO: Output speed control command to physical motor driver (e.g., PWM, analogWrite)
#else
  state.motor_speed = speedValue;
#endif
}

void controlWinderSpeed(float speedValue) {
#if USE_REAL_SENSORS
  // TODO: Output speed control command to physical winder motor driver
#else
  state.winder_speed = speedValue;
#endif
}

void executeEmergencyStop() {
#if USE_REAL_SENSORS
  // TODO: Implement physical emergency stop logic (immediately shut off all heaters and motors)
#else
  state.running = false;
  state.motor_speed = 0;
  state.winder_speed = 0;
#endif
}

// ═══════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════

float addNoise(float value, float range) {
  return value + (random(0, 1000) / 1000.0 - 0.5) * range;
}

float maybeAnomaly(float value, float normal, float spikeHigh, float spikeLow) {
  if (random(0, 100) < (int)(ANOMALY_CHANCE * 100)) {
    float spike = (random(0, 2) == 0) ? spikeHigh : spikeLow;
    Serial.printf("[ANOMALY] %.2f -> %.2f\n", normal, spike);
    return spike;
  }
  return value;
}

// ═══════════════════════════════════════════════════════
//  Wi-Fi Connection Management
// ═══════════════════════════════════════════════════════

void setupWiFi() {
  Serial.printf("[WiFi] Connecting to \"%s\"...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true); // Enable background auto-reconnects
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    WiFi.setSleep(false); // Disable Wi-Fi Modem Sleep to increase stability
  } else {
    Serial.println("\n[WiFi] Connection failed! Restarting ESP32 in 5s...");
    delay(5000);
    ESP.restart();
  }
}

// ═══════════════════════════════════════════════════════
//  Telemetry Generation & Transmission
// ═══════════════════════════════════════════════════════

void publishTelemetry(BufferedTelemetry data) {
  // Build JSON payload matching the TelemetryData schema exactly
  StaticJsonDocument<384> doc;
  doc["device_id"]          = DEVICE_ID;
  doc["heater_1"]           = round(data.heater_1 * 100) / 100.0;
  doc["heater_2"]           = round(data.heater_2 * 100) / 100.0;
  doc["heater_3"]           = round(data.heater_3 * 100) / 100.0;
  doc["motor_speed"]        = round(data.motor_speed * 100) / 100.0;
  doc["filament_diameter"]  = round(data.filament_diameter * 100) / 100.0;
  doc["winder_speed"]       = round(data.winder_speed * 100) / 100.0;

  // Preserve generation time by converting timestamp_ms into ISO 8601 format
  char ts[25];
  snprintf(ts, sizeof(ts), "%04d-%02d-%02dT%02d:%02d:%02d.000Z",
           2026, 5, 24,   // Static date, time derived from relative millis
           (data.timestamp_ms / 3600000) % 24,
           (data.timestamp_ms / 60000) % 60,
           (data.timestamp_ms / 1000) % 60);
  doc["timestamp"] = ts;

  char payload[384];
  serializeJson(doc, payload);

  bool isHistorical = (millis() - data.timestamp_ms > 2000);
  if (mqtt.publish(TOPIC_TELEMETRY, payload)) {
    lastSuccessfulPublishMs = millis();
    Serial.printf("[TX%s] t1=%.1f t2=%.1f t3=%.1f | motor=%.0f | dia=%.2f | winder=%.0f\n",
                  isHistorical ? "-OFFLINE" : "",
                  data.heater_1, data.heater_2, data.heater_3, data.motor_speed, data.filament_diameter, data.winder_speed);
  } else {
    Serial.println("[TX] Transmission FAILED!");
  }
}

// ═══════════════════════════════════════════════════════
//  Command Handling (Server -> ESP32)
// ═══════════════════════════════════════════════════════

void handleCommand(char* topic, byte* payload, unsigned int length) {
  // Null-terminate the raw payload
  char buf[256];
  unsigned int len = min(length, (unsigned int)(sizeof(buf) - 1));
  memcpy(buf, payload, len);
  buf[len] = '\0';

  Serial.printf("[RX] Command: %s\n", buf);

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, buf);
  if (err) {
    Serial.printf("[RX] JSON parse error: %s\n", err.c_str());
    return;
  }

  const char* type = doc["type"];

  if (strcmp(type, "SET_TEMPERATURE") == 0) {
    int zone = doc["zone"] | 0;
    float val = doc["value"] | 0;
    controlHeater(zone, val);
    Serial.printf("[CMD] Heater %d target temperature -> %.1f C\n", zone, val);

  } else if (strcmp(type, "SET_MOTOR_SPEED") == 0) {
    float val = doc["value"] | 0.0;
    controlMotorSpeed(val);
    Serial.printf("[CMD] Extruder motor target speed -> %.0f RPM\n", val);

  } else if (strcmp(type, "SET_WINDER_SPEED") == 0) {
    float val = doc["value"] | 0.0;
    controlWinderSpeed(val);
    Serial.printf("[CMD] Winder target speed -> %.0f RPM\n", val);

  } else if (strcmp(type, "EMERGENCY_STOP") == 0) {
    executeEmergencyStop();
    Serial.println("[CMD] ! EMERGENCY STOP RECEIVED - Halted all actuators !");

  } else if (strcmp(type, "START") == 0) {
    state.running = true;
    controlMotorSpeed(30);
    controlWinderSpeed(25);
    Serial.println("[CMD] System started");

  } else if (strcmp(type, "STOP") == 0) {
    state.running = false;
    controlMotorSpeed(0);
    controlWinderSpeed(0);
    Serial.println("[CMD] System stopped");

  } else {
    Serial.printf("[CMD] Unknown command: %s\n", type);
  }
}

// ═══════════════════════════════════════════════════════
//  MQTT Connection Management
// ═══════════════════════════════════════════════════════

boolean mqttReconnect() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  Serial.printf("[MQTT] Connecting to broker (%s:%d)...\n", MQTT_BROKER, MQTT_PORT);

  // LWT (Last Will and Testament) payload for automatic offline alerts
  char lwtPayload[64];
  StaticJsonDocument<64> lwtDoc;
  lwtDoc["status"]    = "disconnected";
  lwtDoc["device_id"] = DEVICE_ID;
  serializeJson(lwtDoc, lwtPayload);

  if (mqtt.connect(DEVICE_ID, TOPIC_STATUS, 1, false, lwtPayload)) {
    Serial.println("[MQTT] Connected!");

    // Publish online status
    StaticJsonDocument<64> statusDoc;
    statusDoc["status"]    = "online";
    statusDoc["device_id"] = DEVICE_ID;
    char statusPayload[64];
    serializeJson(statusDoc, statusPayload);
    mqtt.publish(TOPIC_STATUS, statusPayload);

    // Subscribe to commands topic
    mqtt.subscribe(TOPIC_COMMAND);
    Serial.printf("[MQTT] Subscribed to topic \"%s\"\n", TOPIC_COMMAND);
    return true;
  } else {
    Serial.printf("[MQTT] Failed, rc=%d.\n", mqtt.state());
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  Arduino Setup & Loop
// ═══════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n===================================");
  Serial.println("  GreenExtrude ESP32 Simulator");
  Serial.println("  Testing Mode: Simulated Sensor Data");
  Serial.println("===================================\n");

  randomSeed(analogRead(0));

  initHardware(); // Initialize hardware interfaces and pin modes

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  setupWiFi();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setKeepAlive(30); // 30s Keep-alive protects against network jitter
  mqtt.setCallback(handleCommand);
  mqttReconnect();
}

void loop() {
  // ─── Built-in LED: OK = solid, ANY problem = blink ───
  unsigned long sinceLastPublish = millis() - lastSuccessfulPublishMs;
  if (sinceLastPublish < 1500) {
    digitalWrite(LED_BUILTIN, HIGH);                  // Solid = data flowing normally
  } else if (sinceLastPublish < 5000) {
    digitalWrite(LED_BUILTIN, (millis() / 250) % 2);  // Blink = data stuck (>1.5s no publish)
  } else {
    digitalWrite(LED_BUILTIN, (millis() / 100) % 2);  // Fast blink = long outage (>5s)
  }

  // If Wi-Fi is lost, pause loops and let ESP32 reconnect in the background
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiLog = 0;
    if (millis() - lastWifiLog >= 5000) {
      lastWifiLog = millis();
      Serial.println("[WiFi] Disconnected! Attempting to reconnect in the background...");
    }
    return;
  }

  // Non-blocking MQTT reconnect attempts
  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttemptMs >= RECONNECT_DELAY_MS) {
      lastReconnectAttemptMs = now;
      if (mqttReconnect()) {
        lastReconnectAttemptMs = 0;
      }
    }
  } else {
    mqtt.loop();
  }

  // Periodic telemetry generation and buffering
  unsigned long now = millis();
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    if (state.running) {
      BufferedTelemetry newTelemetry;
      
      newTelemetry.heater_1 = readHeaterTemperature(1);
      newTelemetry.heater_2 = readHeaterTemperature(2);
      newTelemetry.heater_3 = readHeaterTemperature(3);
      newTelemetry.motor_speed = readMotorSpeed();
      newTelemetry.filament_diameter = readFilamentDiameter();
      newTelemetry.winder_speed = readWinderSpeed();
      newTelemetry.timestamp_ms = now;

      pushToBuffer(newTelemetry);
      Serial.printf("[BUFF] Generated new telemetry packet. Queue size: %d\n", bufferCount);
    }
  }

  // Send queued data one packet per loop iteration if MQTT is connected
  if (mqtt.connected() && bufferCount > 0) {
    BufferedTelemetry unsentData;
    if (popFromBuffer(unsentData)) {
      publishTelemetry(unsentData);
      // Small delay prevents overwhelming the broker during burst transmissions
      if (bufferCount > 0) {
        delay(30);
      }
    }
  }
}
