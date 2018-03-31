import { TestReconciliationState } from '../TestResults'

export enum TestState {
  Fail = 'fail',
  Pass = 'pass',
  Skip = 'skip',
  Unknown = 'unknown',
}

export const TestStateByTestReconciliationState = {
  [TestReconciliationState.KnownFail]: TestState.Fail,
  [TestReconciliationState.KnownSkip]: TestState.Skip,
  [TestReconciliationState.KnownSuccess]: TestState.Pass,
  [TestReconciliationState.Unknown]: TestState.Unknown,
}
