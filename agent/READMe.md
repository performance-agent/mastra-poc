## LangGraph ejecutable

El flujo implementado actualmente se puede ejecutar con:

```bash
npm run demo:flow
```

El demo usa fixtures determinísticos y no necesita credenciales de un modelo o backend. Para visualizar cada nodo y su estado en LangSmith:

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY="<api-key>"
export LANGSMITH_PROJECT="mastra-poc-agent-flow"
export LANGCHAIN_CALLBACKS_BACKGROUND=false
npm run demo:flow
```

Para ejecutar el flujo completo con Gemini en el nodo de comprensión de reglas y ver cada llamada al modelo anidada en la traza de LangSmith:

```bash
npm run demo:flow:llm
```

Este comando carga `.env`, realiza llamadas reales potencialmente facturables a los modelos configurados en `RULE_UNDERSTANDING_MODEL` y `RULE_SUMMARY_MODEL`, y envía a LangSmith los prompts, resultados estructurados, uso de tokens, latencia y errores. Ambos valores usan el formato `provider:model`; `RULE_SUMMARY_MODEL` puede apuntar a un modelo de razonamiento distinto. El catálogo y la selección de recursos siguen usando fixtures.

Al habilitar tracing, las reglas, el catálogo y los resultados del estado se envían al workspace de LangSmith configurado. El flujo actual es:

```text
RuleInput → ResourceCatalog → RuleUnderstanding → ResourceSelection → EvaluationPlan → ResourceExecution → RuleAssessment
```

Las reglas entendidas siguen hasta el plan aunque otras necesiten aclaración o fallen; esos diagnósticos quedan disponibles y el resultado general se marca como `partial`.

`RuleAssessment` ejecuta una evaluación estructurada por regla sobre la evidencia obtenida. El resultado queda indexado por el identificador estable de la regla e incluye resumen, criterios evaluados con referencias de evidencia, evaluaciones por miembro, justificación basada en una rúbrica explícita, veredicto de soporte y limitaciones.

## Modelo de ejecución del reporte

El sistema está diseñado para generar siempre un mismo tipo de reporte base. Lo que cambia entre ejecuciones no es la estructura general del reporte, sino el conjunto de reglas de evaluación que el usuario solicita aplicar.

Esto permite mantener consistencia entre reportes, comparar resultados entre sprints y evitar que cada consulta produzca una salida diferente o difícil de comparar.

### Estructura fija del reporte

Cada ejecución debe conservar una estructura común:

```text
1. Resumen ejecutivo
2. Alcance de la evaluación
3. Fuentes consultadas
4. Datos disponibles y limitaciones
5. Métricas generales del equipo
6. Evaluación por miembro
7. Reglas evaluadas
8. Anomalías detectadas
9. Comparación con sprints anteriores
10. Recomendaciones
11. Evidencia utilizada
12. Reglas no evaluables
```

### Elemento variable: reglas solicitadas

El usuario puede cambiar las reglas que quiere aplicar en cada ejecución.

Ejemplos:

```text
Evaluar el último sprint usando reglas de trazabilidad entre tickets y branches.
```

```text
Evaluar el último sprint detectando caída de rendimiento, anomalías repetidas y cumplimiento de tiempos.
```

```text
Generar el reporte priorizando participación relativa y diferencias contra el promedio del equipo.
```

En todos los casos, el reporte final mantiene la misma estructura. Lo que cambia es qué reglas se activan, qué datos se necesitan y qué anomalías pueden detectarse.

### Implicancia para el flujo de agentes

Dado que el reporte es siempre el mismo, el `RequestUnderstandingNode` no debe decidir libremente el formato de salida. Su responsabilidad principal es identificar:

* qué reglas pidió el usuario;
* si las reglas existen;
* qué datos necesita cada regla;
* si falta información para ejecutar alguna regla;
* si debe pedir aclaración antes de continuar.

El flujo queda ajustado de la siguiente manera:

```text
User Request
   ↓
RuleRequestUnderstandingNode
   ↓
ReportContextResolutionNode
   ↓
RuleSetSelectionNode
   ↓
DataSourcePlanningNode
   ↓
IntegrationExecutionNode
   ↓
DataNormalizationNode
   ↓
EvidenceLinkingNode
   ↓
MetricCalculationNode
   ↓
RuleEvaluationNode
   ↓
AnomalyDetectionNode
   ↓
InsightGenerationNode
   ↓
RecommendationNode
   ↓
StandardReportGenerationNode
```

### Nuevo criterio de decisión

Si el usuario pide reglas ambiguas, incompletas o no definidas, el sistema debe pedir aclaración antes de ejecutar el reporte.

Ejemplos de ambigüedad:

```text
Evaluar rendimiento.
```

No queda claro si rendimiento significa cumplimiento de tiempos, cantidad de tickets, calidad técnica, participación relativa o comparación contra el sprint anterior.

```text
Revisar anomalías importantes.
```

No queda claro qué anomalías deben considerarse importantes ni qué severidad aplicar.

```text
Aplicar reglas estrictas.
```

No queda claro si se refiere a subir severidades, reducir tolerancias o activar reglas adicionales.

### Comportamiento esperado ante ambigüedad

Cuando el pedido no sea claro, el agente debe preguntar de forma concreta.

Ejemplo:

```text
¿Querés que evalúe rendimiento en base a cumplimiento de tiempos, participación relativa, cantidad de tickets, comparación contra sprint anterior o todas esas reglas juntas?
```

### Regla de diseño

El agente no debe modificar la estructura del reporte según cada pedido.
El usuario modifica las reglas; el sistema conserva el formato estándar.

### Prompt general 
Quiero que actúes como un arquitecto de software senior y technical lead. Necesito que me ayudes a iniciar el desarrollo de una plataforma de evaluación de performance de equipos basada en inteligencia artificial, reglas configurables y evidencia obtenida desde múltiples recursos de datos.

El objetivo del proyecto es construir una plataforma capaz de generar siempre un mismo tipo de reporte estándar de evaluación, pero permitiendo que el usuario cambie dinámicamente las reglas que quiere aplicar. La plataforma no debe estar acoplada a un dominio específico como desarrollo de software, GitHub, Jira, tickets, commits o pull requests. Debe poder servir para evaluar performance en distintos tipos de equipos: desarrollo, marketing, ventas, soporte, operaciones, investigación, equipos académicos u otros.

La idea central es:

```text
Reglas simples del usuario
+
Catálogo de recursos disponibles
+
Contexto del equipo/proyecto/período
=
Plan de evaluación generado por IA
+
Evidencia normalizada
+
Reporte estándar
```

## Contexto funcional

El usuario va a pedir siempre el mismo tipo de reporte. Lo que cambia en cada ejecución son las reglas de evaluación.

Ejemplo de input de reglas:

```ts
type UserRule = {
  name: string;
  description?: string;
  valuation: number;
};
```

Ejemplos:

```json
{
  "name": "Trazabilidad del trabajo",
  "description": "Evaluar si el trabajo declarado tiene evidencia concreta asociada.",
  "valuation": 10
}
```

```json
{
  "name": "Eficiencia de campañas",
  "description": "Evaluar si las campañas lograron buenos resultados en relación con el presupuesto invertido.",
  "valuation": 9
}
```

```json
{
  "name": "Participación relativa",
  "description": "Evaluar si cada miembro tuvo una participación razonable en comparación con el resto del equipo.",
  "valuation": 7
}
```

La IA debe interpretar esas reglas, pero no debe inventar datos. Debe usar únicamente los recursos disponibles en el catálogo que la plataforma le provea.

---

## Principio de diseño principal

No quiero que el sistema dependa de categorías rígidas como:

```text
WORK_TRACKING
SOURCE_CONTROL
CODE_REVIEW
CRM
ADS_PLATFORM
```

En lugar de eso, la plataforma debe proveerle a la IA un catálogo de recursos disponibles. Cada recurso debe describir qué información ofrece, qué operaciones permite ejecutar, qué limitaciones tiene y qué tan confiable es.

La IA debe decidir qué recursos necesita para evaluar cada regla, pero el sistema debe validar de forma determinística que esos recursos y operaciones existan antes de ejecutarlos.

---

## Modelo conceptual genérico

El core de la plataforma debe trabajar con conceptos generales, no con conceptos específicos de una herramienta o dominio.

Usar entidades conceptuales como:

```text
Actor
Team
Project
Period
WorkUnit
Evidence
Outcome
Interaction
Metric
Signal
Rule
NormalizedRule
EvaluationPlan
RuleEvaluationResult
Anomaly
Insight
Recommendation
StandardReport
```

### Equivalencias por dominio

En desarrollo de software:

```text
WorkUnit = ticket, issue, feature, bugfix
Evidence = commit, branch, pull request, review, deploy
Outcome = funcionalidad entregada, bug corregido, release
Interaction = comentario, code review, daily, reunión
```

En marketing:

```text
WorkUnit = campaña, pieza creativa, newsletter, landing, acción comercial
Evidence = métricas de Meta Ads, Google Ads, CRM, calendario editorial
Outcome = leads generados, conversiones, CTR, CPA, publicaciones realizadas
Interaction = aprobación, feedback creativo, reunión, comentario
```

En ventas:

```text
WorkUnit = oportunidad, cuenta, propuesta, contacto comercial
Evidence = actividad CRM, reuniones, emails, llamadas, propuestas enviadas
Outcome = deals ganados, pipeline generado, reuniones concretadas
Interaction = seguimiento, handoff, notas de cuenta
```

En soporte:

```text
WorkUnit = caso, incidente, ticket de cliente
Evidence = tiempos de respuesta, resolución, comentarios, escalaciones
Outcome = ticket resuelto, SLA cumplido, satisfacción del cliente
Interaction = mensajes, handoff, escalación, feedback
```

---

## Catálogo de recursos

Diseñar una entidad `ResourceDescriptor` que describa cada fuente de datos disponible.

Ejemplo conceptual:

```ts
type ResourceDescriptor = {
  id: string;
  name: string;
  description: string;

  resourceType?: string;

  availableOperations: ResourceOperation[];

  dataDescription: string;
  dataSchema?: Record<string, unknown>;

  exampleRecords?: unknown[];

  timeCoverage?: {
    from?: string;
    to?: string;
  };

  freshness?: "realtime" | "hourly" | "daily" | "manual" | "unknown";

  reliability?: "high" | "medium" | "low";

  limitations?: string[];

  accessLevel?: "read_only" | "read_write";
};
```

```ts
type ResourceOperation = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};
```

Ejemplo de recurso para desarrollo:

```json
{
  "id": "github_repository_activity",
  "name": "GitHub Repository Activity",
  "description": "Contiene branches, commits, pull requests, autores, fechas, archivos modificados y estados de merge.",
  "resourceType": "repository_activity",
  "availableOperations": [
    {
      "name": "get_activity_by_period",
      "description": "Obtiene actividad del repositorio dentro de un rango de fechas."
    },
    {
      "name": "get_activity_by_member",
      "description": "Obtiene actividad técnica asociada a un miembro."
    }
  ],
  "dataDescription": "Actividad técnica del repositorio asociada a miembros del equipo.",
  "freshness": "realtime",
  "reliability": "high",
  "limitations": [
    "No refleja trabajo realizado fuera del repositorio.",
    "No mide por sí solo la complejidad real de una tarea."
  ],
  "accessLevel": "read_only"
}
```

Ejemplo de recurso para marketing:

```json
{
  "id": "meta_ads_campaign_metrics",
  "name": "Meta Ads Campaign Metrics",
  "description": "Contiene campañas, anuncios, inversión, impresiones, clicks, CTR, conversiones y costo por resultado.",
  "resourceType": "campaign_performance",
  "availableOperations": [
    {
      "name": "get_campaigns_by_period",
      "description": "Obtiene métricas de campañas activas dentro de un período."
    },
    {
      "name": "get_campaign_metrics_by_owner",
      "description": "Obtiene métricas agrupadas por responsable."
    }
  ],
  "dataDescription": "Métricas cuantitativas de campañas pagas.",
  "freshness": "daily",
  "reliability": "high",
  "limitations": [
    "No explica por sí solo la calidad creativa.",
    "Puede depender de ventanas de atribución."
  ],
  "accessLevel": "read_only"
}
```

---

## Reglas

El usuario carga reglas simples:

```ts
type UserRule = {
  name: string;
  description?: string;
  valuation: number;
};
```

Pero internamente el sistema debe transformarlas en reglas normalizadas y enriquecidas.

```ts
type NormalizedRule = {
  id: string;

  name: string;
  description?: string;
  valuation: number;

  interpretedGoal: string;

  evaluationQuestions: string[];

  expectedSignals: string[];

  selectedResources: SelectedResource[];

  missingEvidencePolicy: "partial" | "not_evaluable" | "ask_user";

  reportSectionHint?: string;

  version: number;
};
```

```ts
type SelectedResource = {
  resourceId: string;
  reason: string;
  requiredOperations: string[];
};
```

Ejemplo de regla simple:

```json
{
  "name": "Eficiencia de campañas",
  "description": "Evaluar si las campañas lograron buenos resultados en relación con el presupuesto invertido.",
  "valuation": 9
}
```

Ejemplo de regla normalizada:

```json
{
  "id": "campaign_efficiency",
  "name": "Eficiencia de campañas",
  "description": "Evaluar si las campañas lograron buenos resultados en relación con el presupuesto invertido.",
  "valuation": 9,
  "interpretedGoal": "Medir la eficiencia entre inversión y resultados obtenidos.",
  "evaluationQuestions": [
    "¿Qué campañas estuvieron activas en el período?",
    "¿Qué inversión tuvo cada campaña?",
    "¿Qué resultados produjo cada campaña?",
    "¿Cómo se compara el resultado contra el período anterior?"
  ],
  "expectedSignals": [
    "inversión",
    "clicks",
    "conversiones",
    "CPA",
    "CTR",
    "leads generados"
  ],
  "selectedResources": [
    {
      "resourceId": "meta_ads_campaign_metrics",
      "reason": "Permite obtener inversión, clicks, conversiones y costo por resultado.",
      "requiredOperations": [
        "get_campaigns_by_period"
      ]
    },
    {
      "resourceId": "crm_leads",
      "reason": "Permite verificar si las conversiones generaron leads reales.",
      "requiredOperations": [
        "get_leads_by_period"
      ]
    }
  ],
  "missingEvidencePolicy": "partial",
  "reportSectionHint": "Métricas de rendimiento y eficiencia por responsable.",
  "version": 1
}
```

---

## Flujo de agentes/nodos

Diseñar el sistema como un flujo de nodos. Cada nodo debe tener responsabilidad clara, input y output estructurado.

El flujo objetivo es:

```text
UserRequest
   ↓
RuleInputNode
   ↓
ResourceCatalogNode
   ↓
RuleUnderstandingNode
   ↓
ResourceSelectionNode
   ↓
EvaluationPlanNode
   ↓
ResourceExecutionNode
   ↓
EvidenceNormalizationNode
   ↓
EvidenceLinkingNode
   ↓
MetricAndSignalExtractionNode
   ↓
RuleEvaluationNode
   ↓
AnomalyDetectionNode
   ↓
InsightGenerationNode
   ↓
RecommendationNode
   ↓
StandardReportGenerationNode
```

---

## Descripción de nodos

### 1. `RuleInputNode`

Responsabilidad:

* recibir reglas simples del usuario;
* validar que tengan `name` y `valuation`;
* validar que `valuation` sea numérico;
* detectar reglas vacías o ambiguas;
* preparar el input para interpretación.

Si una regla no se entiende, el sistema debe preguntar antes de continuar.

---

### 2. `ResourceCatalogNode`

Responsabilidad:

* obtener todos los recursos disponibles para el proyecto/equipo/período;
* exponer descripciones, operaciones, limitaciones y confiabilidad;
* no ejecutar todavía ningún recurso.

---

### 3. `RuleUnderstandingNode`

Responsabilidad:

* interpretar semánticamente cada regla;
* identificar qué quiere medir;
* generar preguntas de evaluación;
* identificar señales esperadas;
* detectar ambigüedad.

Ejemplo output:

```json
{
  "ruleName": "Eficiencia de campañas",
  "interpretedGoal": "Evaluar la relación entre inversión realizada y resultados obtenidos.",
  "possibleSignals": [
    "presupuesto utilizado",
    "conversiones",
    "clicks",
    "CTR",
    "costo por resultado",
    "evolución contra período anterior"
  ],
  "ambiguityDetected": false
}
```

---

### 4. `ResourceSelectionNode`

Responsabilidad:

* elegir del catálogo qué recursos sirven para evaluar cada regla;
* justificar por qué selecciona cada recurso;
* identificar recursos faltantes;
* no inventar recursos ni operaciones.

Input:

```json
{
  "rule": {
    "name": "Eficiencia de campañas",
    "description": "Evaluar si las campañas lograron buenos resultados en relación con el presupuesto invertido.",
    "valuation": 9
  },
  "availableResources": []
}
```

Output:

```json
{
  "selectedResources": [
    {
      "resourceId": "meta_ads_campaign_metrics",
      "reason": "Permite obtener inversión, clicks, conversiones y costo por resultado.",
      "requiredOperations": [
        "get_campaigns_by_period"
      ]
    }
  ],
  "missingResources": [
    {
      "description": "Información cualitativa sobre la calidad de las piezas creativas.",
      "impact": "La evaluación puede medir eficiencia cuantitativa, pero no calidad creativa completa."
    }
  ]
}
```

---

### 5. `EvaluationPlanNode`

Responsabilidad:

* construir un plan completo antes de ejecutar datos;
* definir qué reglas se evaluarán;
* definir qué recursos se consultarán;
* definir qué evidencia se espera obtener;
* registrar limitaciones previstas.

Modelo:

```ts
type EvaluationPlan = {
  reportType: "standard_performance_report";

  context: {
    projectId?: string;
    teamId?: string;
    period?: {
      from: string;
      to: string;
    };
  };

  rules: NormalizedRule[];

  resourcePlan: PlannedResourceUsage[];

  expectedEvidence: ExpectedEvidence[];

  limitations: string[];
};
```

---

### 6. `ResourceExecutionNode`

Responsabilidad:

* ejecutar las operaciones validadas;
* manejar errores de recursos;
* guardar respuestas crudas para auditoría;
* registrar cantidad de llamadas;
* permitir evaluación parcial si una fuente falla.

No debe interpretar resultados. Solo ejecuta y devuelve datos crudos.

---

### 7. `EvidenceNormalizationNode`

Responsabilidad:

* transformar datos crudos de cualquier recurso en evidencia genérica;
* asignar confiabilidad;
* conservar referencia al dato original;
* no perder trazabilidad.

Modelo:

```ts
type Evidence = {
  id: string;
  sourceResourceId: string;

  evidenceType: string;
  domain?: string;

  title: string;
  description?: string;

  actorIds?: string[];
  relatedWorkUnitIds?: string[];

  timestamp?: string;

  period?: {
    from: string;
    to: string;
  };

  rawDataRef?: string;

  confidence: number;
  reliability: "high" | "medium" | "low";
};
```

---

### 8. `EvidenceLinkingNode`

Responsabilidad:

* relacionar evidencias entre sí;
* vincular actores, unidades de trabajo, resultados e interacciones;
* detectar evidencia desconectada;
* detectar trabajo declarado sin evidencia;
* detectar evidencia sin responsable.

Este nodo debe funcionar para cualquier dominio.

---

### 9. `MetricAndSignalExtractionNode`

Responsabilidad:

* calcular métricas objetivas cuando sea posible;
* extraer señales relevantes para cada regla;
* diferenciar datos cuantitativos de señales cualitativas.

Ejemplos de señales:

```text
actividad realizada
entregas finalizadas
cumplimiento de fechas
participación relativa
resultado obtenido
calidad de evidencia
consistencia entre trabajo declarado y resultado
evolución contra período anterior
desvíos frente al promedio del equipo
```

---

### 10. `RuleEvaluationNode`

Responsabilidad:

* evaluar cada regla normalizada usando evidencia y señales;
* devolver resultado estructurado;
* no inventar conclusiones cuando falten datos;
* respetar `missingEvidencePolicy`.

Modelo:

```ts
type RuleEvaluationResult = {
  ruleId: string;

  status: "passed" | "failed" | "partial" | "not_evaluable";

  valuation: number;

  scoreImpact?: number;

  summary: string;

  evidenceIds: string[];

  affectedEntities: string[];

  confidence: number;

  missingData?: string[];

  limitations?: string[];
};
```

---

### 11. `AnomalyDetectionNode`

Responsabilidad:

* detectar inconsistencias, patrones raros o alertas;
* agrupar anomalías por regla, actor, equipo o período;
* marcar severidad cuando corresponda.

Modelo:

```ts
type Anomaly = {
  id: string;
  type: string;

  title: string;
  description: string;

  severity: "low" | "medium" | "high" | "critical";

  relatedRuleIds: string[];

  affectedEntities: string[];

  evidenceIds: string[];

  confidence: number;
};
```

---

### 12. `InsightGenerationNode`

Responsabilidad:

* transformar resultados, métricas y anomalías en conclusiones entendibles;
* explicar qué pasó;
* indicar nivel de confianza;
* aclarar limitaciones;
* no inventar causas.

---

### 13. `RecommendationNode`

Responsabilidad:

* sugerir acciones concretas;
* priorizar casos;
* indicar qué revisar manualmente;
* proponer ajustes de reglas o recursos;
* diferenciar recomendaciones preventivas de problemas confirmados.

---

### 14. `StandardReportGenerationNode`

Responsabilidad:

Generar siempre el mismo reporte base, independientemente de las reglas pedidas.

Estructura fija:

```text
1. Resumen ejecutivo
2. Alcance de la evaluación
3. Reglas solicitadas
4. Recursos consultados
5. Datos disponibles y limitaciones
6. Resultados generales
7. Evaluación por regla
8. Evaluación por actor/equipo
9. Anomalías detectadas
10. Comparación con períodos anteriores, si existe información
11. Recomendaciones
12. Evidencia utilizada
13. Reglas no evaluables
14. Limitaciones del análisis
```

El reporte debe distinguir claramente entre:

```text
cumplimiento confirmado
incumplimiento confirmado
evaluación parcial
dato faltante
regla no evaluable
posible anomalía
recomendación preventiva
```

---

## Manejo de ambigüedad

Si la regla no se entiende, el sistema debe preguntar.

Ejemplo de regla ambigua:

```json
{
  "name": "Evaluar rendimiento",
  "valuation": 10
}
```

Pregunta esperada:

```text
¿Querés que rendimiento se evalúe por resultados obtenidos, cumplimiento de tiempos, participación relativa, calidad del trabajo, comparación contra el período anterior o una combinación de esos criterios?
```

No continuar si la ambigüedad afecta de forma significativa el resultado.

---

## Manejo de datos faltantes

El sistema debe poder seguir con evaluación parcial.

Si faltan recursos o datos:

* no inventar evidencia;
* no penalizar automáticamente;
* marcar la regla como `partial` o `not_evaluable`;
* explicar qué faltó;
* indicar qué recurso ayudaría a evaluarla mejor.

Ejemplo:

```json
{
  "ruleId": "campaign_efficiency",
  "status": "partial",
  "summary": "Se pudo evaluar inversión, clicks y conversiones, pero no se pudo validar calidad de leads porque no hay recurso CRM disponible.",
  "missingData": [
    "leads validados",
    "estado comercial posterior a la conversión"
  ]
}
```

---

## Observabilidad y auditoría

Registrar cada ejecución.

Modelo:

```ts
type EvaluationRunLog = {
  runId: string;

  startedAt: string;
  finishedAt?: string;

  requestedRulesCount: number;
  normalizedRulesCount: number;

  resourcesAvailableCount: number;
  resourcesSelectedCount: number;

  llmCalls: number;
  resourceCalls: number;

  successfulResourceCalls: number;
  failedResourceCalls: number;

  evaluatedRules: number;
  partialRules: number;
  notEvaluableRules: number;

  generatedAnomalies: number;
  generatedRecommendations: number;
};
```

También registrar:

```text
llamadas al LLM
prompts usados
modelo usado
versión del prompt
recursos seleccionados
justificación de selección
operaciones ejecutadas
errores
evidencia generada
reglas no evaluables
```

---

## Guardrails obligatorios

1. El sistema no debe inventar recursos.
2. El sistema no debe inventar operaciones.
3. El sistema no debe inventar evidencia.
4. El sistema no debe penalizar cuando no hay datos suficientes.
5. El sistema debe explicar limitaciones.
6. El sistema debe permitir evaluación parcial.
7. El sistema debe generar siempre el mismo formato de reporte.
8. El sistema debe conservar trazabilidad entre conclusión y evidencia.
9. El sistema debe separar datos crudos, evidencia normalizada, métricas, insights y recomendaciones.
10. El sistema debe estar preparado para múltiples dominios, no solo desarrollo de software.

---

## Entregables que necesito que generes primero

Antes de implementar lógica compleja, generá una base clara del proyecto.

Quiero que produzcas:

1. `README.md`

   * objetivo del sistema;
   * principios de diseño;
   * flujo de agentes;
   * modelo de reglas;
   * modelo de recursos;
   * estructura estándar del reporte;
   * ejemplos de uso para desarrollo y marketing.

2. `docs/architecture.md`

   * arquitectura general;
   * separación entre core, recursos, agentes y reportes;
   * flujo completo de evaluación.

3. `docs/agents.md`

   * descripción de cada nodo;
   * input y output esperado;
   * si usa LLM o lógica determinística;
   * errores posibles.

4. `docs/rules.md`

   * estructura de `UserRule`;
   * estructura de `NormalizedRule`;
   * ejemplos de reglas;
   * manejo de ambigüedad;
   * manejo de datos faltantes.

5. `docs/resources.md`

   * estructura de `ResourceDescriptor`;
   * estructura de `ResourceOperation`;
   * ejemplos de recursos para desarrollo, marketing, ventas y soporte;
   * validación de operaciones.

6. `docs/report.md`

   * estructura fija del reporte;
   * ejemplos de secciones;
   * criterios para mostrar reglas no evaluables;
   * criterios para mostrar evidencia y limitaciones.

7. Estructura inicial de carpetas sugerida:

```text
src/
  core/
    domain/
      entities/
      rules/
      evidence/
      metrics/
      reports/
    evaluation/
      planning/
      normalization/
      scoring/
      anomalies/
      insights/
    agents/
      nodes/
      prompts/
      schemas/

  resources/
    contracts/
    registry/
    adapters/
      examples/

  application/
    use-cases/
    orchestrators/

  infrastructure/
    logging/
    persistence/
    config/

  interfaces/
    api/
    cli/

docs/
  architecture.md
  agents.md
  rules.md
  resources.md
  report.md
```

---

## Criterios de implementación

Implementar con buenas prácticas:

* funciones cortas;
* nombres explícitos;
* separación clara de responsabilidades;
* evitar condicionales enormes;
* usar tipos fuertes;
* validar inputs y outputs;
* mantener el core desacoplado de integraciones concretas;
* escribir código legible y mantenible;
* agregar comentarios solo donde aporten claridad real;
* diseñar pensando en extensibilidad;
* no hardcodear dominios específicos;
* no acoplar reglas a APIs concretas.

---

## Primer objetivo de desarrollo

El primer objetivo no es conectar APIs reales todavía.

El primer objetivo es construir una base funcional con recursos mockeados.

Necesito que implementes o prepares:

1. modelos de dominio;
2. catálogo de recursos mock;
3. reglas de usuario mock;
4. normalización de reglas;
5. selección de recursos por IA o simulada mediante servicio reemplazable;
6. validación determinística de recursos y operaciones durante la selección;
7. ejecución mock de recursos;
8. normalización de evidencia;
9. evaluación básica de reglas;
10. generación de reporte estándar.

---

## Resultado esperado del primer MVP

El MVP debe permitir ejecutar algo como:

```json
{
  "context": {
    "teamId": "team_001",
    "period": {
      "from": "2026-06-01",
      "to": "2026-06-30"
    }
  },
  "rules": [
    {
      "name": "Trazabilidad del trabajo",
      "description": "Evaluar si el trabajo declarado tiene evidencia concreta asociada.",
      "valuation": 10
    },
    {
      "name": "Participación relativa",
      "description": "Evaluar si los miembros participaron de forma razonable respecto del equipo.",
      "valuation": 8
    }
  ]
}
```

Y obtener como salida un reporte estándar con:

```text
resumen ejecutivo
reglas evaluadas
recursos usados
evidencia encontrada
resultados por regla
resultados por actor
anomalías
recomendaciones
limitaciones
reglas parciales o no evaluables
```

---

## Modo de trabajo esperado

Primero analizá esta especificación.

Después proponé una estructura inicial del proyecto y generá los archivos de documentación base.

Luego avanzá con los modelos y contratos principales.

No empieces conectando APIs reales.

No centres la solución en GitHub, Jira ni desarrollo de software.

El diseño debe quedar preparado para que el día de mañana se pueda agregar cualquier recurso nuevo mediante un adapter, por ejemplo:

```text
GitHub
Jira
GitLab
Linear
Trello
Notion
Slack
Google Calendar
Google Docs
Meta Ads
Google Ads
HubSpot
Salesforce
Zendesk
Intercom
archivos CSV
carga manual
```

La plataforma debe evaluar performance basada en evidencia, reglas configurables y recursos disponibles.
