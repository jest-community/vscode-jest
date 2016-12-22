declare namespace jest {
    function resetAllMocks(): typeof jest;

    interface Mock<T> {
        mockReset(): void;
    }
}