export type TestReconciliationState = 'Unknown' | 'KnownSuccess' | 'KnownFail' | 'KnownSkip';

// tslint:disable-next-line variable-name
export const TestReconciliationState = {
  Unknown: 'Unknown' as TestReconciliationState,
  KnownSuccess: 'KnownSuccess' as TestReconciliationState,
  KnownFail: 'KnownFail' as TestReconciliationState,
  KnownSkip: 'KnownSkip' as TestReconciliationState,
};
