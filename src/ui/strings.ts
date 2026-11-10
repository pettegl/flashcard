// The only app-owned strings (NFR-11, UISPEC §U.4, §U.10). Learner-visible text comes from content files.
export const strings = {
  loading: 'Loading',
  contentUnavailable: (code: string) => `Content unavailable, code ${code}`,
} as const;
