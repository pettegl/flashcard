// The only app-owned strings (NFR-11, UISPEC §U.4, §U.10). Learner-visible text comes from content files.
export const strings = {
  loading: 'Loading',
  contentUnavailable: (code: string) => `Content unavailable, code ${code}`,
  cardFront: (n: number, total: number) => `Card ${n} of ${total}. Activate to reveal the word.`,
  cardBack: (word: string, n: number, total: number) => `${word}. Card ${n} of ${total}. Activate to flip back.`,
} as const;
