type AnyJson = Record<string, any>;

export function shapeHistory(data: AnyJson) {
  if (data?.error) return data;

  if (
    data &&
    typeof data === "object" &&
    Array.isArray(data.index) &&
    Array.isArray(data.values)
  ) {
    return {
      entityId: data.entityId,
      entityType: data.entityType,
      attrName: data.attrName,
      count: data.values.length,
      readings: data.index.map((timestamp: string, i: number) => ({
        timestamp,
        value: data.values[i]
      }))
    };
  }

  return data;
}