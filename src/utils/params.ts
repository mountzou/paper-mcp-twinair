export function cleanParams(
    params: Record<string, string | undefined>
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
    ) as Record<string, string>;
}