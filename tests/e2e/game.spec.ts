import { expect, test } from "@playwright/test";
import { generateChallenge, randomIdentity } from "../../src/game/challenge";
import { neighbors, pokemonById } from "../../src/game/data";
import { encodeChallenge } from "../../src/game/prng";

function shortestPath(startId: number, targetId: number): number[] {
  const queue = [startId];
  const previous = new Map<number, number | null>([[startId, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === targetId) break;
    for (const edge of neighbors[String(current)] ?? []) {
      if (previous.has(edge.id)) continue;
      previous.set(edge.id, current);
      queue.push(edge.id);
    }
  }
  const path: number[] = [];
  for (let current: number | null = targetId; current !== null; current = previous.get(current) ?? null) {
    path.push(current);
  }
  return path.reverse();
}

test("opens a shared challenge and completes a valid path", async ({ page }) => {
  const identity = randomIdentity(123456, "N");
  const challenge = generateChallenge(identity);
  const route = shortestPath(challenge.startIds[0], challenge.targetId);

  await page.goto("/?challenge=" + encodeChallenge(identity));
  await expect(page.getByRole("heading", { name: /从一只宝可梦/ })).toBeVisible();
  await page.getByRole("button", { name: "使用链接中的挑战码" }).click();
  await page.getByRole("button", { name: "进入挑战" }).click();
  await expect(page.getByText("选择路径起点")).toBeVisible();

  await page.getByRole("button", { name: new RegExp(pokemonById.get(route[0])!.name) }).click();
  for (const id of route.slice(1)) {
    await page.getByRole("button", { name: new RegExp(pokemonById.get(id)!.name) }).click();
  }

  await expect(page.getByText("路径完成")).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(pokemonById.get(challenge.targetId)!.name) })).toBeVisible();
});
