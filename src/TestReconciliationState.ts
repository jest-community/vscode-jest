export type TestReconciliationState = 'Unknown' |
    'KnownSuccess' |
    'KnownFail';
export const TestReconciliationState = {
    Unknown: 'Unknown' as TestReconciliationState,
    KnownSuccess: 'KnownSuccess' as TestReconciliationState,
    KnownFail: 'KnownFail' as TestReconciliationState,
};
