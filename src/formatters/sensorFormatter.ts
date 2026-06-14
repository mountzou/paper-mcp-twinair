type AnyJson = Record<string, any>;

export const DEFAULT_SENSOR_ATTRS = [
  "airTemperature",
  "relativeHumidity",
  "co2",
  "eco2",
  "pm1",
  "pm25",
  "pm10",
  "tvoc",
  "formaldehyde",
  "barometricPressure",
  "noiseLevel",
  "light",
  "battery",
  "rssi"
] as const;

export type SensorAttr = (typeof DEFAULT_SENSOR_ATTRS)[number];

function propValue(input: any): any {
  if (input && typeof input === "object" && "value" in input) return input.value;
  if (input && typeof input === "object" && "object" in input) return input.object;
  return input;
}

function propUnit(input: any): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  return input.unitCode;
}

function propObservedAt(input: any): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  return input.observedAt;
}

function shapeMeasurement(entity: AnyJson, attr: SensorAttr) {
  const value = propValue(entity[attr]);
  if (value === undefined || value === null) return undefined;

  return {
    value,
    unit: propUnit(entity[attr]),
    observedAt: propObservedAt(entity[attr])
  };
}

export function shapeCurrentSensor(entity: AnyJson) {
  if (entity?.error) return entity;

  const measurements = Object.fromEntries(
    DEFAULT_SENSOR_ATTRS
      .map((attr) => [attr, shapeMeasurement(entity, attr)] as const)
      .filter(([, measurement]) => measurement !== undefined)
  );

  return {
    id: entity.id,
    type: entity.type,
    name: propValue(entity.name),
    description: propValue(entity.description),
    pilot: propValue(entity.refPilot),
    room: propValue(entity.refRoom),
    source: propValue(entity.source),
    location: propValue(entity.location),
    observedAt: propValue(entity.observationDateTime) ?? propValue(entity.timestamp),
    measurements
  };
}

export function shapeCurrentSensors(data: any) {
  if (data?.error) return data;
  if (!Array.isArray(data)) return data;

  return {
    count: data.length,
    sensors: data.map(shapeCurrentSensor)
  };
}