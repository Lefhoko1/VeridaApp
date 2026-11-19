import type { AssistantContext, BusinessFact } from '../domain/models';
import { answerQuestion } from './RuleBasedAssistantGateway';

function fact(code: string, overrides: Partial<BusinessFact> = {}): BusinessFact {
  return { code, name: code, display: 'P100.00', value: 100, status: 'actual', explanation: 'Explanation.', note: null, ...overrides };
}

const context = (facts: BusinessFact[]): AssistantContext => ({
  businessId: 'biz-1',
  conversationId: 'conversation-1',
  businessName: 'Vinabbie',
  industryName: 'Agriculture · Poultry',
  mainGoal: 'Understand overall performance',
  periodLabel: 'the last 30 days',
  facts,
});

describe('Ask Verida rules', () => {
  it('uses the validated figure when explaining revenue (FR-G09)', () => {
    const answer = answerQuestion('What is my revenue?', context([fact('revenue', { name: 'Revenue' })]));
    expect(answer.text).toContain('P100.00');
    expect(answer.confidence).toBe('verified');
  });

  it('says so when there is not enough data (FR-G12)', () => {
    const answer = answerQuestion('How are my costs?', context([fact('expenses', { name: 'Recorded expenses', value: null, display: null, status: 'unavailable', note: 'No expenses recorded.' })]));
    expect(answer.confidence).toBe('insufficient_data');
    expect(answer.text).toContain('No expenses recorded.');
  });

  it('marks estimated figures as estimates (FR-G13)', () => {
    const answer = answerQuestion('expenses?', context([fact('expenses', { name: 'Recorded expenses', status: 'estimated', note: 'Includes estimated costs.' })]));
    expect(answer.confidence).toBe('estimate');
    expect(answer.text).toContain('Includes estimated costs.');
  });

  it('never presents the recorded balance as verified profit (FR-G15)', () => {
    const answer = answerQuestion('Am I making money?', context([fact('recorded_balance', { display: 'P70.00', value: 70, status: 'estimated' })]));
    expect(answer.confidence).toBe('estimate');
    expect(answer.text).toContain('not verified net profit');
  });

  it('will not estimate profit without both sales and expenses', () => {
    const answer = answerQuestion('Teach me about profit', context([fact('recorded_balance', { value: null, display: null, status: 'unavailable' })]));
    expect(answer.confidence).toBe('insufficient_data');
    expect(answer.text).toContain('Profit is what remains');
  });

  it('answers about any KPI of the industry by name', () => {
    const answer = answerQuestion('explain my hen-day laying rate', context([fact('hen_day_rate', { name: 'Hen-day laying rate', display: '80%', value: 80 })]));
    expect(answer.text).toContain('80%');
    expect(answer.intent).toBe('kpi:hen_day_rate');
  });

  it.each([
    ['How do I record a sale?', 'sale'],
    ['how can I add an expense', 'expense'],
    ['help me capture eggs collected', 'activity'],
  ])('offers the form for "%s" without saving anything (FR-G18, FR-G20)', (question, target) => {
    const answer = answerQuestion(question, context([]));
    expect(answer.suggestedCapture).toBe(target);
    expect(answer.confidence).toBe('guidance');
    expect(answer.text).toContain('nothing is saved until you confirm');
  });

  it('explains what information a record needs (FR-G17, FR-G19)', () => {
    expect(answerQuestion('How do I record a sale?', context([])).text).toContain('quantity and the unit price');
  });

  it('asking about sales is not mistaken for a request to record one', () => {
    const answer = answerQuestion('What were my sales?', context([fact('revenue', { name: 'Revenue' })]));
    expect(answer.suggestedCapture).toBeNull();
    expect(answer.intent).toBe('kpi:revenue');
  });

  it('falls back without claiming anything about the business', () => {
    const answer = answerQuestion('What is the capital of France?', context([fact('revenue', { name: 'Revenue' })]));
    expect(answer.confidence).toBe('guidance');
    expect(answer.text).not.toContain('P100.00');
  });
});

describe('Ask Verida and the Plan task form (Plan journey 5.1)', () => {
  it('opens a task form titled from what the person asked to be reminded of', () => {
    const answer = answerQuestion('Remind me to order feed on Friday.', context([]));
    expect(answer).toMatchObject({ suggestedCapture: 'task', intent: 'capture:task', capturePrefill: { title: 'Order feed on Friday' } });
    expect(answer.text).toContain('nothing is saved until you confirm');
  });

  it('does not mistake an ordinary question for a task', () => {
    expect(answerQuestion('I need to know my profit', context([fact('recorded_balance')])).suggestedCapture).not.toBe('task');
    expect(answerQuestion('What tasks help a poultry farm?', context([])).suggestedCapture).toBeNull();
  });
});
