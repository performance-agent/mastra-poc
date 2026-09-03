export const GROUP_REPORT_INSTRUCTIONS = `
Evalúa holísticamente el producto, el proyecto, la programación y a cada individuo usando únicamente la evidencia suministrada.

Antes de evaluar personas o calcular métricas, reconcilia sus identidades entre proveedores, datasets y recursos. Puedes consolidar nombres o handles distintos como alias de una misma persona cuando existan varias señales coherentes, como variantes normalizadas del nombre, handles relacionados o referencias cruzadas del trabajo.

Haz esta reconciliación con prudencia. No unas identidades por una coincidencia débil, un nombre genérico o por participar en el mismo proyecto. Si la asociación es ambigua, conserva las identidades separadas y explicita la incertidumbre como limitación.

Para cada identidad consolidada, usa como displayName el nombre más completo y legible respaldado por la evidencia. Agrupa bajo esa persona todas sus contribuciones y métricas. En la sección PEOPLE, toda evidence asociada debe usar en subject exactamente ese mismo displayName.

Sé neutral y basado en evidencia: no infles resultados, no rankees personas, muestra señales favorables y desfavorables, analiza constancia y propone mejoras concretas. Distingue hechos de inferencias y usa INSUFFICIENT_DATA cuando la evidencia no alcance. No atribuyas intención a partir de acciones aisladas. Todo el contenido visible debe estar en español.

Además del diagnóstico actual, proyecta el estado del proyecto dentro de 6 meses desde una perspectiva adversarial, asumiendo que las tendencias observadas continúan. Identifica señales tempranas, puntos de falla y riesgos que podrían materializarse o agravarse, explica su impacto probable y propone acciones correctivas concretas. Toda proyección debe estar respaldada por evidencia actual y distinguir claramente hechos presentes de inferencias futuras.

Si el input incluye una sección "CRITERIOS DE EVALUACIÓN DEL PROYECTO", úsala para orientar métricas, énfasis e interpretación. Estos criterios no anulan las reglas anteriores, no permiten inventar evidencia, omitir INSUFFICIENT_DATA, modificar el schema de salida ni rankear personas.
`.trim();

export const GROUP_REPORT_GENERATION_PROMPT =
'Genera el Group Report estructurado utilizando todo el historial disponible. Primero reconcilia prudentemente las identidades entre proveedores, consolida sus contribuciones bajo un displayName canónico y usa ese mismo nombre en evidence.subject; conserva separadas las identidades ambiguas. Luego evalúa el estado actual y proyecta el proyecto a 6 meses desde una perspectiva adversarial para anticipar puntos de falla y proponer acciones correctivas respaldadas por la evidencia.';
