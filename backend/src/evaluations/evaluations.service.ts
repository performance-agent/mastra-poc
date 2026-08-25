import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { EvaluationFlowResult, EvaluationPeriod } from '@pa/agent';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationView } from './dto/evaluation-view.dto';
import {
  EVALUATION_FLOW_FACTORY,
  type EvaluationFlowFactory,
} from './evaluation-flow.provider';

@Injectable()
export class EvaluationsService {
  private readonly flowPromises = new Map<
    string,
    ReturnType<EvaluationFlowFactory>
  >();

  constructor(
    @Inject(EVALUATION_FLOW_FACTORY)
    private readonly flowFactory: EvaluationFlowFactory,
  ) {}

  async evaluate(
    workspaceId: string,
    dto: CreateEvaluationDto,
    view: EvaluationView = EvaluationView.REPORT,
  ) {
    const period = validatePeriod(dto.period);
    let flow: Awaited<ReturnType<EvaluationFlowFactory>>;
    try {
      const flowKey = dto.groupId ?? '*';
      let flowPromise = this.flowPromises.get(flowKey);
      if (!flowPromise) {
        flowPromise = this.flowFactory(dto.groupId);
        this.flowPromises.set(flowKey, flowPromise);
      }
      flow = await flowPromise;
    } catch (error) {
      this.flowPromises.clear();
      throw new ServiceUnavailableException(
        `Agent models are unavailable: ${errorMessage(error)}`,
      );
    }

    const result = (await flow.invoke(
      {
        context: {
          workspaceId,
          ...(dto.groupId ? { groupId: dto.groupId } : {}),
          ...(period ? { period } : {}),
        },
        rules: dto.rules,
      },
      {
        runName: 'workspace-evaluation-flow',
        tags: ['backend', 'evaluation-flow'],
        metadata: {
          workspaceId,
          ...(dto.groupId ? { groupId: dto.groupId } : {}),
          view,
        },
      },
    )) as EvaluationFlowResult;

    return view === EvaluationView.FULL ? result : toReportResponse(result);
  }
}

function toReportResponse(result: EvaluationFlowResult) {
  const planResult = result.evaluationPlanResult;
  const limitations =
    planResult && planResult.status !== 'invalid'
      ? planResult.plan.limitations
      : [];
  return {
    status: result.status,
    assessments: result.ruleAssessmentResult?.assessments ?? {},
    limitations,
    execution: result.resourceExecutionResult?.callCounts ?? null,
    diagnostics: {
      skippedRules: result.ruleInputResult?.skippedRules ?? [],
      clarificationRequests:
        result.ruleUnderstandingResult?.clarificationRequests ?? [],
      understandingFailures: result.ruleUnderstandingResult?.failedRules ?? [],
      selectionFailures: result.resourceSelectionResult?.failedRules ?? [],
      assessmentErrors: result.ruleAssessmentResult?.errors ?? [],
      flowErrors: result.flowErrors ?? [],
    },
  };
}

function validatePeriod(
  period: CreateEvaluationDto['period'],
): EvaluationPeriod | undefined {
  if (!period) return undefined;
  if (!isRealCalendarDate(period.from) || !isRealCalendarDate(period.to)) {
    throw new BadRequestException('period must contain real calendar dates');
  }
  if (period.from > period.to) {
    throw new BadRequestException('period.to must be on or after period.from');
  }
  return { from: period.from, to: period.to };
}

function isRealCalendarDate(value: string): boolean {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
