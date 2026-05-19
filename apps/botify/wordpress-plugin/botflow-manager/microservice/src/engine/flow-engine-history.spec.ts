import { describe, it, expect } from 'vitest';
import { wpMessagesToAiHistory } from './flow-engine-history.js';

describe('wpMessagesToAiHistory', () => {
  it('maps incoming/outgoing to user/assistant', () => {
    const h = wpMessagesToAiHistory(
      [
        { direction: 'incoming', content: 'Oi' },
        { direction: 'outgoing', content: 'Olá!' },
      ],
      'tchau',
    );
    expect(h).toEqual([
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá!' },
    ]);
  });

  it('drops last user row when it duplicates the current inbound text', () => {
    const h = wpMessagesToAiHistory(
      [
        { direction: 'incoming', content: 'First' },
        { direction: 'outgoing', content: 'Reply' },
        { direction: 'incoming', content: 'Same turn' },
      ],
      'Same turn',
    );
    expect(h).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Reply' },
    ]);
  });

  it('uses [mídia] placeholder when content empty but mediaUrl set', () => {
    const h = wpMessagesToAiHistory(
      [{ direction: 'incoming', content: '', mediaUrl: 'https://ex.com/a.jpg' }],
      'next',
    );
    expect(h).toEqual([{ role: 'user', content: '[mídia]' }]);
  });
});
