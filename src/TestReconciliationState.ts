export type TestReconciliationState = 'Unknown' | 'KnownSuccess' | 'KnownFail' | 'KnownSkip'
export const TestReconciliationState = {
  Unknown: 'Unknown' as TestReconciliationState,
  KnownSuccess: 'KnownSuccess' as TestReconciliationState,
  KnownFail: 'KnownFail' as TestReconciliationState,
  KnownSkip: 'KnownSkip' as TestReconciliationState,
}
