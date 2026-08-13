import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

interface PokemonRecord { id: number; name: string }
interface Edge { id: number }

const pokemonFile = JSON.parse(readFileSync("data/game/pokemon.json", "utf-8"));
const graphFile = JSON.parse(readFileSync("data/game/graph.json", "utf-8"));
const pokemon = pokemonFile.pokemon as PokemonRecord[];
const pokemonByName = new Map(pokemon.map((item) => [item.name, item.id]));
const pokemonById = new Map(pokemon.map((item) => [item.id, item]));
const neighbors = graphFile.neighbors as Record<string, Edge[]>;

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

async function choosePagedNeighbor(page: Page, name: string): Promise<void> {
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    const choice = page.locator(".neighbor-choice").filter({ hasText: name });
    if (await choice.count()) {
      await choice.first().click();
      return;
    }
    const nextPage = page.locator(".neighbor-next");
    if (await nextPage.isDisabled()) break;
    await nextPage.click();
  }
  throw new Error(`Could not find paged neighbor: ${name}`);
}

test("opens a shared challenge and completes a valid path", async ({ page }) => {
  await page.goto("/?challenge=P1-G6-A1-N-002N9C");
  await expect(page.getByRole("heading", { name: /从一只宝可梦/ })).toBeVisible();
  await page.getByRole("button", { name: "使用链接中的挑战码" }).click();
  await page.getByRole("button", { name: "进入挑战" }).click();
  await expect(page.getByText("选择路径起点")).toBeVisible();

  const targetName = await page.locator(".target-strip h1").innerText();
  const startName = await page.locator(".pokemon-choice strong").first().innerText();
  const route = shortestPath(pokemonByName.get(startName)!, pokemonByName.get(targetName)!);

  await page.getByRole("button", { name: new RegExp(startName) }).click();
  await expect(page.locator(".current-stage")).toHaveCount(0);
  await expect(page.locator(".pokemon-summary")).toHaveCount(2);
  await expect(page.locator(".pokemon-summary").first().locator("strong")).toHaveText(startName);
  await expect(page.locator(".path-map--compact")).toBeVisible();
  await expect(page.locator(".path-map--compact .map-path-node")).toHaveCount(1);
  await expect(page.locator(".path-map--compact .map-context-node")).toHaveCount(0);
  await page.locator(".pokemon-summary").first().hover();
  await expect(page.locator(".header-pokemon-preview")).toBeVisible();
  await expect(page.locator(".preview-copy h2")).toHaveText(startName);
  await page.mouse.move(0, 0);
  await expect(page.locator(".header-pokemon-preview")).toHaveCount(0);
  const firstNeighborCount = Math.min(neighbors[String(route[0])].length, 5);
  expect(neighbors[String(route[0])]).toHaveLength(20);
  await expect(page.locator(".neighbor-choice")).toHaveCount(firstNeighborCount);
  await expect(page.locator(".neighbor-page-status")).toContainText("/ 20 个相似节点");
  await expect(page.locator(".neighbor-description")).toHaveCount(firstNeighborCount);
  await expect(page.locator(".neighbor-meta .type-list")).toHaveCount(0);
  if (neighbors[String(route[0])].length > 5) {
    await expect(page.locator(".neighbor-next")).toBeEnabled();
    await page.locator(".neighbor-next").click();
    await expect(page.locator(".neighbor-previous")).toBeEnabled();
    await page.locator(".neighbor-previous").click();
  }
  for (const id of route.slice(1)) {
    await choosePagedNeighbor(page, pokemonById.get(id)!.name);
    await expect(page.locator(".pokemon-summary").first().locator("strong")).toHaveText(pokemonById.get(id)!.name);
  }

  await expect(page.getByText("路径完成")).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(targetName) })).toBeVisible();
  await expect(page.locator(".path-map--complete")).toBeVisible();
  await expect(page.locator(".path-map--complete .map-path-node")).toHaveCount(route.length);
  await expect(page.locator(".path-map--complete .map-context-node")).toHaveCount(pokemon.length);
});
