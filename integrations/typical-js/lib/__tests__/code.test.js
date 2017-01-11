const code =require("../code")

describe("my project", () => {
  it("returns the right value", () => {
    expect(code()).toEqual(23)
  })

  it("is a wrong test", () => {
    expect(code()).toEqual(21)
  })
})
