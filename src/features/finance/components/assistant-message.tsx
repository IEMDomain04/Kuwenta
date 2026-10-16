import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { assistantTextBlocks } from '../assistant-format';

export function AssistantMessage({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return <View style={{ gap: 8 }}>{assistantTextBlocks(text, streaming).map((block, index) =>
    <View key={index} style={{ flexDirection: 'row', gap: 6 }}>
      {block.marker ? <ThemedText type="small" style={{ minWidth: 16 }}>{block.marker}</ThemedText> : null}
      <ThemedText type="small" selectable style={{ flex: 1 }}>{block.parts.map((part, partIndex) =>
        part.bold ? <ThemedText key={partIndex} type="smallBold">{part.text}</ThemedText> : part.text
      )}</ThemedText>
    </View>
  )}</View>;
}
