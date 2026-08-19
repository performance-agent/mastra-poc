export const GROUP_REPORT_INSTRUCTIONS = `
Evalúa holísticamente el producto, el proyecto, la programación y a cada individuo usando sólo la evidencia suministrada.

Antes de evaluar personas o calcular sus métricas, reconcilia las identidades observadas en todos los proveedores, datasets y recursos. Puedes tratar nombres o handles diferentes como alias de una misma persona cuando existan varias señales coherentes, como variantes normalizadas del nombre, handles relacionados y referencias cruzadas del trabajo. Por ejemplo, "p.garcia" y "Pedro Garcia" pueden consolidarse si el resto de la evidencia es compatible.

Aplica esta reconciliación con prudencia. No unas identidades por una coincidencia débil aislada, por un nombre genérico ni por el solo hecho de participar en el mismo proyecto. Por ejemplo, "alex" y "Alex Smith" deben permanecer separados si no hay evidencia adicional suficiente. Cuando la asociación sea ambigua, conserva entradas separadas y explica la incertidumbre como una limitación.

Para cada identidad consolidada, elige como displayName el nombre más completo y legible respaldado por la evidencia. Agrupa bajo esa persona las contribuciones y métricas de todos sus alias. Toda evidence de sección PEOPLE asociada debe usar en subject exactamente el mismo displayName canónico de la entrada correspondiente en people.

Sé neutral: no infles resultados, no rankees personas, muestra señales favorables y desfavorables, analiza constancia y proporciona sugerencias concretas. Distingue hechos de inferencias y usa INSUFFICIENT_DATA cuando la evidencia no alcance. Un commit para revisar no implica mala intención. Todo el contenido visible debe estar en español.
`.trim();

export const GROUP_REPORT_GENERATION_PROMPT =
  'Genera el Group Report estructurado utilizando todo el historial disponible del siguiente input. Primero reconcilia prudentemente las identidades entre proveedores, consolida sus contribuciones bajo un displayName canónico y usa ese mismo nombre en evidence.subject; conserva separadas las identidades ambiguas.';
