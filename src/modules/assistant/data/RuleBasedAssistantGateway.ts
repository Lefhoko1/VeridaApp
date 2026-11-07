import type { AssistantAnswer, AssistantContext, BusinessFact, CaptureTarget } from '../domain/models';
import type { AssistantGateway } from '../domain/repositories';

const CAPTURE_GUIDES: Record<CaptureTarget, { fields: string; missing: string }> = {
  sale: {
    fields: 'the date, the item or service, the quantity and the unit price. Verida works out the total for you.',
    missing: 'You will need to know how many you sold and the price of each.',
  },
  expense: {
    fields: 'the date, a category, a short description and the amount. You can mark the amount as estimated if you are not sure of it.',
    missing: 'You will need the amount, or your best estimate of it.',
  },
  activity: {
    fields: 'the date, what you are recording and how much. For example, eggs collected or stock received.',
    missing: 'You will need the count or quantity for that day.',
  },
};

const fact = (context: AssistantContext, code: string): BusinessFact | undefined =>
  context.facts.find((item) => item.code === code);

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

function detectCapture(question: string): CaptureTarget | null {
  if (!includesAny(question, ['how do i', 'how can i', 'how to', 'where do i', 'help me', 'want to'])) return null;
  if (!includesAny(question, ['record', 'capture', 'add', 'enter', 'log'])) return null;
  if (question.includes('sale') || question.includes('sold')) return 'sale';
  if (includesAny(question, ['expense', 'cost', 'purchase', 'bought', 'spent'])) return 'expense';
  if (includesAny(question, ['egg', 'feed', 'flock', 'stock', 'activity', 'customer', 'order', 'hours'])) return 'activity';
  return null;
}

function reliability(item: BusinessFact): string {
  if (item.status === 'estimated') return item.note ? ` ${item.note}` : ' This is an estimate.';
  return '';
}

type RuleAnswer = Omit<AssistantAnswer, 'source'>;

// Explains validated KPI results, says plainly when data is missing, and never states
// a conclusion the records do not support (FR-G09, FR-G12, FR-G13, FR-G15).
function explainFact(item: BusinessFact, context: AssistantContext): RuleAnswer {
  if (item.value === null || item.display === null) {
    return {
      text: `I cannot give you ${item.name.toLowerCase()} for ${context.periodLabel.toLowerCase()} yet. ${item.note ?? 'There is not enough recorded data.'} ${item.explanation}`,
      confidence: 'insufficient_data',
      intent: `kpi:${item.code}`,
      suggestedCapture: null,
    };
  }
  return {
    text: `${item.name} for ${context.businessName} over ${context.periodLabel.toLowerCase()} is ${item.display}.${reliability(item)} ${item.explanation}`,
    confidence: item.status === 'estimated' ? 'estimate' : 'verified',
    intent: `kpi:${item.code}`,
    suggestedCapture: null,
  };
}

export function answerQuestion(rawQuestion: string, context: AssistantContext): RuleAnswer {
  const question = rawQuestion.toLowerCase();

  const capture = detectCapture(question);
  if (capture) {
    const guide = CAPTURE_GUIDES[capture];
    return {
      text: `To record this, you will enter ${guide.fields} ${guide.missing} I can open the form for you, and nothing is saved until you confirm it.`,
      confidence: 'guidance',
      intent: `capture:${capture}`,
      suggestedCapture: capture,
    };
  }

  if (includesAny(question, ['profit', 'making money', 'earn'])) {
    const balance = fact(context, 'recorded_balance');
    const definition = 'Profit is what remains after the relevant costs are deducted from revenue.';
    if (!balance || balance.value === null || balance.display === null) {
      return {
        text: `${definition} I cannot estimate yours yet, because I need both sales and expenses recorded for ${context.periodLabel.toLowerCase()}.`,
        confidence: 'insufficient_data',
        intent: 'profit',
        suggestedCapture: null,
      };
    }
    return {
      text: `${definition} Your recorded balance for ${context.periodLabel.toLowerCase()} is ${balance.display}, but this is only a simple recorded balance, not verified net profit. Some costs or accounting adjustments may be missing.`,
      confidence: 'estimate',
      intent: 'profit',
      suggestedCapture: null,
    };
  }

  if (includesAny(question, ['cost', 'expense', 'spend', 'spent'])) {
    const expenses = fact(context, 'expenses');
    if (expenses) return explainFact(expenses, context);
  }
  if (includesAny(question, ['revenue', 'sales', 'income', 'sold'])) {
    const revenue = fact(context, 'revenue');
    if (revenue) return explainFact(revenue, context);
  }

  // Any KPI this industry tracks can be asked about by name.
  const named = context.facts.find((item) => question.includes(item.name.toLowerCase()));
  if (named) return explainFact(named, context);

  if (includesAny(question, ['what should i record', 'record every day', 'daily', 'start recording'])) {
    return {
      text: `For ${context.industryName.toLowerCase()}, start with three habits: record every sale, record each expense, and capture one important operating measure. You do not need a complicated spreadsheet to begin.`,
      confidence: 'guidance',
      intent: 'record_guidance',
      suggestedCapture: null,
    };
  }

  const measures = context.facts
    .filter((item) => item.code !== 'records_captured')
    .map((item) => item.name.toLowerCase())
    .slice(0, 5)
    .join(', ');
  const goal = context.mainGoal ? ` Your main goal is to ${context.mainGoal.charAt(0).toLowerCase()}${context.mainGoal.slice(1)}.` : '';
  return {
    text: `I can help with questions about ${context.businessName}, using the records you have entered.${goal} Try asking about ${measures}, how to record something, or what profit means.`,
    confidence: 'guidance',
    intent: 'fallback',
    suggestedCapture: null,
  };
}

export class RuleBasedAssistantGateway implements AssistantGateway {
  async answer(question: string, context: AssistantContext): Promise<AssistantAnswer> {
    return { ...answerQuestion(question, context), source: 'rules' };
  }
}
