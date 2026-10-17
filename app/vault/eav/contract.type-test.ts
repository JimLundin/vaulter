import { e, openDatabase, clear, type EntityRef } from './index.ts';

function inspect(...values: unknown[]) {
  return values;
}

const Conversation = e.entity('conversation', {
  title: e.string(),
  summary: e.string().optional(),
});
const Message = e.entity('message', {
  conversation: e.ref(Conversation),
  text: e.string(),
  sentAt: e.datetime(),
  related: e.set(e.ref(Conversation)).optional(),
});
// Same attributes, different entity identity: shape alone must not confer identity.
const OtherConversation = e.entity('other-conversation', { title: e.string() });
const schema = e.registry({
  conversations: Conversation.extend({ messages: e.inverse(Message, 'conversation') }),
  messages: Message,
  other: OtherConversation,
});

export async function contract() {
  await using db = await openDatabase({ schema });
  const first = await db.entities.messages.first({
    where: { sentAt: { gte: new Date() } },
    select: { text: true, conversation: { title: true } },
    orderBy: [{ sentAt: 'desc' }],
  });
  // @ts-expect-error first can return undefined; callers must handle absence.
  inspect(first.text);
  if (first) {
    const text: string = first.text;
    const title: string = first.conversation.title;
    inspect([text, title]);
    await db.transaction((tx) => tx.entities.messages.update({ ...first, text: 'Updated' }));
    // @ts-expect-error first retains the exact projection.
    inspect(first.sentAt);
  }
  // @ts-expect-error first owns its one-result limit.
  await db.entities.messages.first({ select: { text: true }, limit: 2 });
  // @ts-expect-error first validates nested selections just like query.
  await db.entities.messages.first({ select: { conversation: { typo: true } } });
  const latest = await db.history.transactions.first({
    select: { sequence: true, committedAt: true },
    orderBy: [{ sequence: 'desc' }],
  });
  if (latest) {
    const date: Date = latest.committedAt;
    inspect(date);
    const evidenceSource = await db.entities.messages.first({ select: {} });
    if (evidenceSource) {
      const address = await db.history.reference(latest, evidenceSource);
      const restored = await db.history.resolve(address);
      await db.history.inspect(restored.transaction, restored.entity);
      db.at(restored.transaction);
      // @ts-expect-error An evidence address cannot replace a live typed entity reference.
      await db.transaction((tx) => tx.entities.messages.delete(address));
      // @ts-expect-error An entity is not an accepted transaction handle.
      await db.history.reference(evidenceSource, evidenceSource);
      // @ts-expect-error A detached object is not an entity reference.
      await db.history.reference(latest, { text: 'Copied' });
    }
    const past = db.at(latest);
    const earlier = await past.entities.messages.first({ select: { text: true } });
    if (earlier) {
      const text: string = earlier.text;
      inspect(text);
    }
    // @ts-expect-error Historical views expose only reads.
    past.entities.messages.delete(earlier);
    const changes = await db.history.entities.messages.first({
      where: { transaction: { eq: latest } },
      select: { before: { text: true }, after: { conversation: { title: true } } },
    });
    if (changes?.before) {
      const text: string = changes.before.text;
      inspect(text);
      // @ts-expect-error Historical projections preserve their selected fields.
      inspect(changes.before.sentAt);
    }
    // @ts-expect-error A historical query result is not an ordinary message entity.
    await db.transaction((tx) => tx.entities.messages.delete(latest));
  }
  // @ts-expect-error Writes exist only inside a transaction.
  await db.entities.messages.insert({});
  // @ts-expect-error The registry exposes only registered names.
  inspect(db.entities.unknown);

  const result = await db.transaction(async (tx) => {
    const conversation = await tx.entities.conversations.insert({ title: 'Conversation' });
    await tx.entities.conversations.update({ ...conversation, summary: clear });
    // @ts-expect-error Required attributes cannot be cleared.
    await tx.entities.conversations.update({ ...conversation, title: clear });
    const optional = await tx.entities.conversations.first({ select: { summary: true } });
    if (optional) await tx.entities.conversations.update(optional);
    const inverse = await tx.entities.conversations.first({ select: { messages: { text: true } } });
    if (inverse) {
      // @ts-expect-error Derived inverse fields are read-only.
      await tx.entities.conversations.update(inverse);
      await tx.entities.conversations.delete(inverse);
    }
    await tx.entities.messages.first({
      select: { text: true },
      // @ts-expect-error Ordering uses scalar fields, not expanded relationships.
      orderBy: [{ conversation: 'asc' }],
    });
    const other = await tx.entities.other.insert({ title: 'Conversation' });
    const message = await tx.entities.messages.insert({
      conversation,
      text: 'Hello',
      sentAt: new Date(),
      related: [conversation],
    });
    await tx.entities.messages.update({ ...message, text: 'Corrected' });
    await tx.entities.messages.update(message);
    await tx.entities.messages.delete(message);
    await tx.entities.messages.delete({ ...message });
    // Attribute omission retains opaque identity, allowing a smaller update patch.
    const { text, sentAt, conversation: originalConversation, related, ...identity } = message;
    inspect([text, sentAt, originalConversation, related]);
    await tx.entities.messages.update({ ...identity, text: 'Only text' });
    await tx.entities.messages.delete(identity);

    const messages = await tx.entities.messages.query({
      where: {
        and: [
          { sentAt: { gte: new Date() } },
          { conversation: { eq: conversation } },
          { conversation: { matches: { title: { contains: 'Conversation' } } } },
        ],
      },
      select: { text: true, conversation: { title: true } },
      orderBy: [{ sentAt: 'desc' }],
      limit: 50,
    });
    for (const selected of messages) {
      const selectedText: string = selected.text;
      const selectedTitle: string = selected.conversation.title;
      inspect([selectedText, selectedTitle]);
      // All projections, including nested ones, implicitly preserve identity.
      await tx.entities.messages.update(selected);
      await tx.entities.messages.update({ ...selected, text: 'Changed' });
      await tx.entities.messages.delete(selected);
      await tx.entities.conversations.update({ ...selected.conversation, title: 'Renamed' });
      await tx.entities.conversations.delete(selected.conversation);
      await tx.entities.messages.insert({
        conversation: selected.conversation,
        text: 'Next',
        sentAt: new Date(),
      });
      // @ts-expect-error Unselected attributes are not available.
      inspect(selected.sentAt);
      // @ts-expect-error Nested results expose only selected fields.
      inspect(selected.conversation.summary);
      // @ts-expect-error Read results are readonly.
      selected.text = 'Cannot mutate';
      // @ts-expect-error Nested read results are readonly.
      selected.conversation.title = 'Cannot mutate';
    }

    const references = await tx.entities.messages.query({ select: { conversation: true } });
    const reference: EntityRef<typeof Conversation> = references[0]!.conversation;
    await tx.entities.conversations.delete(reference);
    // @ts-expect-error An unresolved reference exposes no unselected attributes.
    inspect(reference.title);
    const groups = await tx.entities.messages.query({ select: { related: { title: true } } });
    for (const group of groups) {
      for (const item of group.related ?? []) {
        const title: string = item.title;
        inspect(title);
        await tx.entities.conversations.update({ ...item, title: 'Renamed' });
      }
    }
    // Empty selection can serve as an opaque reference without any public fields.
    const identities = await tx.entities.messages.query({ select: {} });
    await tx.entities.messages.update({ ...identities[0]!, text: 'Small patch' });
    await tx.entities.messages.delete(identities[0]!);

    // @ts-expect-error No raw ID is exposed on an entity.
    inspect(message.id);
    // @ts-expect-error No raw ID is exposed on a reference.
    inspect(message.conversation.id);
    // @ts-expect-error Insert still requires required fields.
    await tx.entities.messages.insert({ conversation });
    // @ts-expect-error An existing entity cannot be inserted as a new entity.
    await tx.entities.messages.insert(message);
    // @ts-expect-error Spreading an entity does not strip its identity for reinsertion.
    await tx.entities.messages.insert({ ...message });
    // @ts-expect-error Incorrect attribute value type.
    await tx.entities.messages.insert({ conversation, text: 123, sentAt: new Date() });
    await tx.entities.messages.insert({
      conversation,
      text: 'Hello',
      sentAt: new Date(),
      // @ts-expect-error Unknown attributes are rejected on fresh objects.
      typo: true,
    });
    const badInput = { conversation, text: 'Hello', sentAt: new Date(), typo: true };
    // @ts-expect-error Unknown attributes are also rejected on variables.
    await tx.entities.messages.insert(badInput);
    await tx.entities.messages.insert({
      // @ts-expect-error Raw strings cannot identify references.
      conversation: 'some-id',
      text: 'Hello',
      sentAt: new Date(),
    });
    await tx.entities.messages.insert({
      // @ts-expect-error Hand-written ID objects cannot identify references.
      conversation: { id: 'some-id' },
      text: 'Hello',
      sentAt: new Date(),
    });
    await tx.entities.messages.insert({
      // @ts-expect-error Matching data does not create entity identity.
      conversation: { title: 'Conversation' },
      text: 'Hello',
      sentAt: new Date(),
    });
    // @ts-expect-error References retain their entity type.
    await tx.entities.messages.insert({ conversation: message, text: 'Hello', sentAt: new Date() });
    // @ts-expect-error Matching fields from a different entity type do not suffice.
    await tx.entities.messages.insert({ conversation: other, text: 'Hello', sentAt: new Date() });
    await tx.entities.messages.insert({
      conversation,
      text: 'Hello',
      sentAt: new Date(),
      // @ts-expect-error Collections retain reference types.
      related: [message],
    });
    // @ts-expect-error Plain patches have no identity.
    await tx.entities.messages.update({ text: 'Edited' });
    // @ts-expect-error A conventional ID field does not confer identity.
    await tx.entities.messages.update({ id: 'some-id', text: 'Edited' });
    // @ts-expect-error Spreading a plain object cannot create identity.
    await tx.entities.messages.update({ ...{ text: 'Edited' } });
    // @ts-expect-error A different entity cannot identify a message.
    await tx.entities.messages.update({ ...conversation, text: 'Edited' });
    // @ts-expect-error Even matching fields cannot identify a different entity type.
    await tx.entities.conversations.update(other);
    // @ts-expect-error Patch attribute values remain checked after spread.
    await tx.entities.messages.update({ ...message, text: 123 });
    // @ts-expect-error Patch attribute names remain checked after spread.
    await tx.entities.messages.update({ ...message, typo: true });
    // @ts-expect-error Plain objects cannot be deleted.
    await tx.entities.messages.delete({ text: 'Hello' });
    // @ts-expect-error Wrong entity objects cannot be deleted through this handle.
    await tx.entities.messages.delete(conversation);
    // @ts-expect-error Raw IDs are not accepted for deletion.
    await tx.entities.messages.delete('some-id');
    // @ts-expect-error Hand-written ID objects are not accepted for deletion.
    await tx.entities.messages.delete({ id: 'some-id' });
    // @ts-expect-error Unknown selection attributes are rejected.
    await tx.entities.messages.query({ select: { text: true, typo: true } });
    // @ts-expect-error Raw IDs are not selectable attributes.
    await tx.entities.messages.query({ select: { id: true } });
    // @ts-expect-error Nested selection names are checked.
    await tx.entities.messages.query({ select: { conversation: { title: true, typo: true } } });
    await tx.entities.messages.query({
      select: { text: true },
      // @ts-expect-error Predicate values match attribute types.
      where: { sentAt: { gte: 'yesterday' } },
    });
    await tx.entities.messages.query({
      select: { text: true },
      // @ts-expect-error Predicate references match entity types.
      where: { conversation: { eq: message } },
    });
    await tx.entities.messages.query({
      select: { text: true },
      // @ts-expect-error Predicate references also require opaque identity.
      where: { conversation: { eq: { title: 'Conversation' } } },
    });
    // @ts-expect-error Insert results are readonly.
    message.text = 'Cannot mutate';
    return message;
  });
  const returned: EntityRef<typeof Message> = result;
  inspect(returned);
}
