// Reconcile deltas and corrected finals by item ID, preserving audio order rather than arrival order.
export function transcriptBuffer() {
  const items = new Map<string, { text: string; final: boolean; previous?: string | null }>();
  const get = (id: string) => {
    if (!items.has(id)) items.set(id, { text: '', final: false });
    return items.get(id)!;
  };
  const order = () => {
    const sorted: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const previous = items.get(id)?.previous;
      if (previous && items.has(previous)) visit(previous);
      sorted.push(id);
    };
    for (const id of items.keys()) visit(id);
    return sorted;
  };
  return {
    accept(event: Record<string, unknown>) {
      if (typeof event.item_id !== 'string') return;
      const item = get(event.item_id);
      if (event.type === 'input_audio_buffer.committed') {
        item.previous = typeof event.previous_item_id === 'string' ? event.previous_item_id : null;
      } else if (
        event.type === 'conversation.item.input_audio_transcription.delta' &&
        typeof event.delta === 'string' &&
        !item.final
      ) {
        item.text += event.delta;
      } else if (
        event.type === 'conversation.item.input_audio_transcription.completed' &&
        typeof event.transcript === 'string'
      ) {
        item.text = event.transcript;
        item.final = true;
      }
    },
    text: () =>
      order()
        .map((id) => items.get(id)!.text.trim())
        .filter(Boolean)
        .join(' '),
    final: (id: string) => items.get(id)?.final ?? false,
  };
}
