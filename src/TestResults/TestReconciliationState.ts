export type TestReconciliationStateType =
  | 'Unknown'
  | 'KnownSuccess'
  | 'KnownFail'
  | 'KnownSkip'
  | 'KnownTodo';

// tslint:disable-next-line variable-name
export const TestReconciliationState: {
  [key in TestReconciliationStateType]: TestReconciliationStateType;
} = {
  Unknown: 'Unknown',
  KnownSuccess: 'KnownSuccess',
  KnownFail: 'KnownFail',
  KnownSkip: 'KnownSkip',
  KnownTodo: 'KnownTodo',
};
