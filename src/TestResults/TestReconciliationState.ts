export type TestReconciliationStateType = 'Unknown' | 'KnownSuccess' | 'KnownFail' | 'KnownSkip';

// tslint:disable-next-line variable-name
export const TestReconciliationState: {
  [key in TestReconciliationStateType]: TestReconciliationStateType;
} = {
  Unknown: 'Unknown',
  KnownSuccess: 'KnownSuccess',
  KnownFail: 'KnownFail',
  KnownSkip: 'KnownSkip',
};
