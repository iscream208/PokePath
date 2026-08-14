import { describe, expect, it } from "vitest";
import { buildChallengeShareText, buildPathShareText } from "./share";

describe("challenge share text", () => {
  it("formats every visited Pokemon as one arrow-separated path", () => {
    expect(buildPathShareText(["妙蛙种子", "妙蛙草", "喷火龙"]))
      .toBe("妙蛙种子->妙蛙草->喷火龙");
    expect(buildPathShareText(["皮卡丘", "皮卡丘", "雷丘"]))
      .toBe("皮卡丘->皮卡丘->雷丘");
  });

  it("describes a completed challenge", () => {
    expect(buildChallengeShareText({
      startName: "妙蛙种子",
      targetName: "喷火龙",
      steps: 6,
      won: true,
      url: "https://example.test/?challenge=CODE",
    })).toBe("我从【妙蛙种子】走到【喷火龙】花了6步，（如果愿意的话）请试试看：https://example.test/?challenge=CODE");
  });

  it("describes the current progress before completion", () => {
    expect(buildChallengeShareText({
      startName: "妙蛙种子",
      targetName: "喷火龙",
      steps: 4,
      won: false,
      url: "https://example.test/?challenge=CODE",
    })).toBe("【妙蛙种子】走到【喷火龙】，我花了4步还没有走到，（如果愿意的话）请试试看：https://example.test/?challenge=CODE");
  });
});
