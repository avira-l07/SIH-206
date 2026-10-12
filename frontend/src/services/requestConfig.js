// Command endpoints still require a JSON object, even when they have no fields.
export function withJsonBody(config) {
  return ['post','put','patch'].includes(String(config.method).toLowerCase()) && config.data === undefined
    ? {...config,data:{}}
    : config;
}
