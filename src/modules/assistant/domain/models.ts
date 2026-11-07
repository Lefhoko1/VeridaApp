// FR-G13: how far an answer can be relied on, shown next to the answer.
export type AnswerConfidence = 'verified' | 'estimate' | 'guidance' | 'insufficient_data';

export type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence: AnswerConfidence | null;
};

export type CaptureTarget = 'sale' | 'expense' | 'activity';

export type AssistantAnswer = {
  text: string;
  confidence: AnswerConfidence;
  intent: string;
  // FR-G18, FR-G20: the assistant can open a form, but only the user can save the record.
  suggestedCapture: CaptureTarget | null;
  // Values the user stated, which fill in the form for them to review.
  capturePrefill?: Record<string, string>;
  // FR-G19: required information the user has not given yet.
  missingFields?: string[];
  source: 'ai' | 'rules';
};

// Validated figures supplied by the analytics service. The assistant explains these numbers
// and never calculates its own (section 3.1).
export type BusinessFact = {
  code: string;
  name: string;
  display: string | null;
  value: number | null;
  status: 'actual' | 'estimated' | 'unavailable';
  explanation: string;
  note: string | null;
};

export type AssistantContext = {
  businessId: string;
  conversationId: string;
  businessName: string;
  industryName: string;
  mainGoal: string | null;
  periodLabel: string;
  facts: BusinessFact[];
};
