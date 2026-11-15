import { StyleSheet, View } from 'react-native';
import { Chip, Divider, IconButton, List, Searchbar, Text, TextInput } from 'react-native-paper';

import { Button, EmptyState, ErrorView, LoadingView, Notice, Panel, Row, Screen, SectionHeader, StatusPill, palette, radius, spacing, supporting, IconTile, Reveal, TypingDots, shadows } from '@/design-system';

import type { CaptureTarget } from '../../domain/models';
import { CONFIDENCE_LABEL, QUICK_PROMPTS, useAskViewModel, useConversationsViewModel } from '../viewmodels/useAskViewModel';

const CAPTURE_LABEL: Record<CaptureTarget, string> = {
  sale: 'Open the sale form',
  expense: 'Open the expense form',
  activity: 'Open the activity form',
};

type AskScreenProps = {
  conversationId?: string;
  onCapture: (target: CaptureTarget, prefill: Record<string, string>) => void;
  onOpenHistory?: () => void;
};

export function AskScreen({ conversationId, onCapture, onOpenHistory }: AskScreenProps) {
  const vm = useAskViewModel(conversationId);

  if (vm.loadingHistory) return <LoadingView />;

  return (
    <Screen
      footer={
        <View style={styles.composerBar}>
          <TextInput
            mode="outlined"
            dense
            style={styles.composer}
            outlineColor={supporting.mintBorder}
            outlineStyle={styles.composerOutline}
            placeholder="Ask about your business…"
            value={vm.draft}
            onChangeText={vm.setDraft}
            onSubmitEditing={vm.send}
            returnKeyType="send"
          />
          <IconButton mode="contained" icon="arrow-up" iconColor={supporting.white} containerColor={palette.teal} onPress={vm.send} disabled={vm.sending || vm.draft.trim().length === 0} accessibilityLabel="Send" />
        </View>
      }
    >
      <SectionHeader
        title="Ask Verida"
        description={`Your business companion · ${vm.businessName}`}
        action={
          onOpenHistory ? (
            <IconButton icon="history" onPress={onOpenHistory} accessibilityLabel="Previous conversations" />
          ) : undefined
        }
      />

      <View style={styles.assistantRow}>
        <IconTile icon="creation" size={32} />
        <View style={[styles.bubble, styles.assistantBubble]}>
          <Text variant="bodyMedium">Hello! I can help you understand your business records, explain business concepts and suggest what to learn next. What would you like to explore?</Text>
        </View>
      </View>

      {vm.messages.map((message) => (
        <Reveal key={message.id} style={message.role === 'user' ? styles.userRow : styles.assistantRow}>
          {message.role === 'user' ? null : <IconTile icon="creation" size={32} />}
          <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
          <Text variant="bodyMedium" style={message.role === 'user' ? styles.userText : undefined} accessibilityLabel={`${message.role === 'user' ? 'You' : 'Verida'}: ${message.content}`}>{message.content}</Text>
          {message.confidence ? <StatusPill label={CONFIDENCE_LABEL[message.confidence].label} tone={CONFIDENCE_LABEL[message.confidence].tone} /> : null}
          {message.missingFields?.length ? <Text variant="bodySmall" style={message.role === 'user' ? styles.userText : undefined}>Still needed: {message.missingFields.join(', ')}</Text> : null}
          {message.suggestedCapture ? (
            <Button mode="outlined" compact onPress={() => onCapture(message.suggestedCapture as CaptureTarget, message.capturePrefill ?? {})}>
              {CAPTURE_LABEL[message.suggestedCapture]}
            </Button>
          ) : null}
          </View>
        </Reveal>
      ))}

      {vm.sending ? (
        <View style={styles.assistantRow}>
          <IconTile icon="creation" size={32} />
          <View style={[styles.bubble, styles.assistantBubble]}>
            <TypingDots label="Verida is answering" />
          </View>
        </View>
      ) : null}

      <Row wrap gap={spacing.sm}>
        {QUICK_PROMPTS.map((prompt) => (
          <Chip key={prompt.label} mode="outlined" disabled={vm.sending} onPress={() => vm.ask(prompt.question)} style={styles.prompt}>
            {prompt.label}
          </Chip>
        ))}
      </Row>

      {vm.messages.length > 0 ? <Button onPress={vm.startNew}>Start a new conversation</Button> : null}

      <Notice tone="info">
        {vm.usedRules
          ? 'Verida explains the records you have entered. Answers are guidance, not financial advice. The AI service is not available right now, so this answer used built-in rules.'
          : 'Verida explains the records you have entered. Answers are guidance, not financial advice.'}
      </Notice>
    </Screen>
  );
}

export function ConversationsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const vm = useConversationsViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      <Searchbar placeholder="Search conversations" value={vm.search} onChangeText={vm.setSearch} style={styles.search} />
      {vm.items.length === 0 ? (
        <EmptyState illustration={vm.search ? 'search' : 'chat'} title={vm.search ? 'Nothing matches your search.' : 'No conversations yet.'} />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((conversation, index) => (
            <View key={conversation.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={conversation.title}
                onPress={() => onOpen(conversation.id)}
                right={() => <IconButton icon="delete-outline" disabled={vm.removing} onPress={() => vm.remove(conversation.id)} accessibilityLabel={`Delete ${conversation.title}`} />}
              />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, maxWidth: '94%' },
  userRow: { alignSelf: 'flex-end', maxWidth: '88%' },
  bubble: { flexShrink: 1, padding: spacing.md, borderRadius: radius.lg, gap: spacing.sm, ...shadows.soft },
  // The updated design: Verida's replies on a mint wash, the person's own words on deep teal.
  assistantBubble: { backgroundColor: supporting.mintWash, borderWidth: 1, borderColor: palette.softMint, borderTopLeftRadius: radius.sm },
  userBubble: { backgroundColor: palette.deepTeal, borderTopRightRadius: radius.sm },
  userText: { color: supporting.white },
  prompt: { backgroundColor: supporting.white },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: supporting.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: supporting.line },
  composer: { flex: 1, backgroundColor: supporting.white },
  composerOutline: { borderRadius: radius.xl },
  list: { padding: spacing.xs, gap: 0 },
  search: { backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line },
});
