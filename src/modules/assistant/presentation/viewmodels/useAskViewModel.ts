import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { AnswerConfidence, CaptureTarget, ChatMessage } from '../../domain/models';
import { useAssistantDependencies } from '../di';

export const QUICK_PROMPTS = [
  { label: 'Understand my costs', question: 'How do I understand my costs?' },
  { label: 'What should I record?', question: 'What should I record every day?' },
  { label: 'Teach me about profit', question: 'Teach me about profit' },
];

export const CONFIDENCE_LABEL: Record<AnswerConfidence, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  verified: { label: 'From your records', tone: 'ok' },
  estimate: { label: 'Estimate', tone: 'warn' },
  guidance: { label: 'General guidance', tone: 'neutral' },
  insufficient_data: { label: 'Not enough data', tone: 'warn' },
};

const TITLE_LENGTH = 60;

type LocalMessage = ChatMessage & {
  suggestedCapture?: CaptureTarget | null;
  capturePrefill?: Record<string, string>;
  missingFields?: string[];
};

export function useAskViewModel(initialConversationId?: string) {
  const { conversations, gateway, businessFacts } = useAssistantDependencies();
  const { business, industry } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const scope = [...businessScope(business.id), 'assistant'];

  const [conversationId, setConversationId] = useState(initialConversationId ?? null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [usedRules, setUsedRules] = useState(false);

  const history = useQuery({
    queryKey: [...scope, 'messages', initialConversationId],
    queryFn: () => conversations.messages(initialConversationId ?? ''),
    enabled: Boolean(initialConversationId),
  });

  const send = useMutation({
    mutationFn: async (question: string) => {
      const startedAt = Date.now();
      const activeId = conversationId ?? (await conversations.start(business.id, question.slice(0, TITLE_LENGTH)));
      if (!conversationId) setConversationId(activeId);
      await conversations.addMessage(activeId, 'user', question, null);

      const { periodLabel, facts } = await businessFacts({ businessId: business.id, currency: business.currency });
      const answer = await gateway.answer(question, {
        businessId: business.id,
        conversationId: activeId,
        businessName: business.name,
        industryName: industry?.name ?? 'your business',
        mainGoal: business.mainGoal,
        periodLabel,
        facts,
      });

      await conversations.addMessage(activeId, 'assistant', answer.text, answer.confidence);
      // The AI service logs its own requests. Best effort: a logging failure must not lose an answer.
      if (answer.source === 'rules') {
        void conversations
          .logRequest({
            businessId: business.id,
            intent: answer.intent,
            outcome: answer.confidence === 'insufficient_data' ? 'insufficient_data' : 'answered',
            latencyMs: Date.now() - startedAt,
          })
          .catch(() => undefined);
      }
      return answer;
    },
    onMutate: (question) => {
      setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content: question, confidence: null }]);
      setDraft('');
    },
    onSuccess: (answer) => {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: answer.text,
          confidence: answer.confidence,
          suggestedCapture: answer.suggestedCapture,
          capturePrefill: answer.capturePrefill,
          missingFields: answer.missingFields,
        },
      ]);
      setUsedRules(answer.source === 'rules');
      void queryClient.invalidateQueries({ queryKey: [...scope, 'conversations'] });
    },
    onError: (error, question) => {
      setDraft(question);
      setMessages((current) => current.slice(0, -1));
      feedback.error(errorMessage(error));
    },
  });

  const { mutate } = send;
  const ask = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (trimmed) mutate(trimmed);
    },
    [mutate],
  );

  return {
    businessName: business.name,
    messages: [...(history.data ?? []), ...messages] as LocalMessage[],
    loadingHistory: history.isLoading,
    usedRules,
    draft,
    setDraft,
    sending: send.isPending,
    send: () => ask(draft),
    ask,
    startNew() {
      setConversationId(null);
      setMessages([]);
      setDraft('');
    },
  };
}

export function useConversationsViewModel() {
  const { conversations } = useAssistantDependencies();
  const { business } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const queryKey = [...businessScope(business.id), 'assistant', 'conversations'];
  const [search, setSearch] = useState('');

  const list = useQuery({ queryKey: [...queryKey, { search }], queryFn: () => conversations.list(business.id, search) });

  const remove = useMutation({
    mutationFn: (id: string) => conversations.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      feedback.success('Conversation deleted.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    search,
    setSearch,
    remove: (id: string) => remove.mutate(id),
    removing: remove.isPending,
  };
}
