import { TestReconciliationState } from '../TestResults';

export enum TestState {
  Fail = 'fail',
  Pass = 'pass',
  Skip = 'skip',
  Todo = 'todo',
  Unknown = 'unknown',
}

// tslint:disable-next-line variable-name
export const TestStateByTestReconciliationState = {
  [TestReconciliationState.KnownFail]: TestState.Fail,
  [TestReconciliationState.KnownSkip]: TestState.Skip,
  [TestReconciliationState.KnownTodo]: TestState.Todo,
  [TestReconciliationState.KnownSuccess]: TestState.Pass,
  [TestReconciliationState.Unknown]: TestState.Unknown,
};
