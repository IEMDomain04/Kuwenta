import model from '../../../assets/models/model.json';
import type { AssistantContext, AssistantTurn } from './assistant-context';
export const assistantModel = model;
export function assistantAvailability() { return 'Offline chat is available in the installed mobile app.'; }
export function createAssistantSession() {
  return { ask: async (_question: string, _facts: AssistantContext, _history: readonly AssistantTurn[], _status: (status: 'loading' | 'thinking' | 'answering') => void, _onText?: (text: string) => void): Promise<string> => { throw new Error(assistantAvailability()); }, stop: async () => {}, dispose: async () => {} };
}
