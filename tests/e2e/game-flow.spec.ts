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

test("opens an easy challenge with a map and completes a valid path", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?challenge=P1-G6-A2-E-002N9C");
  await expect(page.getByRole("heading", { name: /从一只宝可梦/ })).toBeVisible();
  await expect(page.locator("#challenge-code")).toHaveValue("P1-G6-A2-E-002N9C");
  await page.getByRole("button", { name: "进入挑战" }).click();
  await expect(page.getByText("本局路线")).toBeVisible();
  await expect(page.getByText("简单模式", { exact: true })).toBeVisible();

  const targetName = await page.locator(".route-specimen--target h2").innerText();
  const startName = await page.locator(".route-specimen--start h2").innerText();
  const route = shortestPath(pokemonByName.get(startName)!, pokemonByName.get(targetName)!);
  expect(route.length - 1).toBeGreaterThanOrEqual(3);

  await page.getByRole("button", { name: "从这里出发" }).click();
  await expect(page.locator(".current-stage")).toHaveCount(0);
  await expect(page.locator(".pokemon-summary")).toHaveCount(2);
  await expect(page.locator(".pokemon-summary").first().locator("strong")).toHaveText(startName);
  const map = page.locator(".path-map__canvas");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-node-count", String(pokemon.length));
  await expect(map).toHaveAttribute("data-edge-count", "20500");
  await expect(map).toHaveAttribute("data-current-id", String(route[0]));
  await expect(map).toHaveAttribute("data-target-id", String(pokemonByName.get(targetName)!));
  await expect(map).toHaveAttribute("data-visited-count", "0");
  await expect(map).toHaveAttribute("data-layout", "anchored-force");
  await expect(map).toHaveAttribute("data-motion", "elastic");
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
  await page.locator(".next-heading-actions").getByRole("button", { name: "复制挑战链接" }).click();
  await expect(page.getByText("当前进度与挑战链接已复制")).toBeVisible();
  const inProgressShare = await page.evaluate(() => navigator.clipboard.readText());
  expect(inProgressShare).toBe(
    `【${startName}】走到【${targetName}】，我花了0步还没有走到，（如果愿意的话）请试试看：https://iscream208.github.io/PokePath/?challenge=P1-G6-A2-E-002N9C`,
  );
  if (neighbors[String(route[0])].length > 5) {
    await expect(page.locator(".neighbor-next")).toBeEnabled();
    await page.locator(".neighbor-next").click();
    await expect(page.locator(".neighbor-previous")).toBeEnabled();
    await page.locator(".neighbor-previous").click();
  }
  for (const id of route.slice(1)) {
    await choosePagedNeighbor(page, pokemonById.get(id)!.name);
    await expect(page.locator(".pokemon-summary").first().locator("strong")).toHaveText(pokemonById.get(id)!.name);
    await expect(map).toHaveAttribute("data-current-id", String(id));
    await expect(map).toHaveAttribute("data-pulse-node", String(id));
  }

  await expect(page.getByText("路径完成")).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(targetName) })).toBeVisible();
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-current-id", String(route.at(-1)!));
  await expect(map).toHaveAttribute("data-visited-count", String(route.length - 1));
  await page.getByRole("button", { name: "复制挑战链接" }).click();
  await expect(page.getByText("通关结果与挑战链接已复制")).toBeVisible();
  const completedShare = await page.evaluate(() => navigator.clipboard.readText());
  expect(completedShare).toBe(
    `我从【${startName}】走到【${targetName}】花了${route.length - 1}步，（如果愿意的话）请试试看：https://iscream208.github.io/PokePath/?challenge=P1-G6-A2-E-002N9C`,
  );
});

test("opens a hard challenge without creating the map", async ({ page }) => {
  await page.goto("/?challenge=P1-G6-A2-H-002N9C");
  await expect(page.locator("#challenge-code")).toHaveValue("P1-G6-A2-H-002N9C");
  await page.getByRole("button", { name: "进入挑战" }).click();
  await expect(page.getByText("困难模式", { exact: true })).toBeVisible();
  await expect(page.getByText("游玩时不显示关系地图")).toBeVisible();

  await page.getByRole("button", { name: "随机重选" }).click();
  await expect(page.locator(".edition")).toContainText("-H-");
  await page.getByRole("button", { name: "从这里出发" }).click();

  await expect(page.locator(".play-workspace")).toHaveClass(/without-map/);
  await expect(page.locator(".graph-sidebar")).toHaveCount(0);
  await expect(page.locator(".path-map__canvas")).toHaveCount(0);
  await expect(page.locator(".step-count")).toContainText("困难模式");
  await expect(page.locator(".neighbor-choice")).toHaveCount(5);
});

test("shows all five choices in one mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 737 });
  await page.goto("/?challenge=P1-G6-A2-E-002N9C");
  await page.getByRole("button", { name: "进入挑战" }).click();
  await page.getByRole("button", { name: "从这里出发" }).click();

  const choices = page.locator(".neighbor-choice");
  await expect(choices).toHaveCount(5);
  await expect(page.locator(".neighbor-figure i")).toHaveCount(0);
  for (let index = 0; index < 5; index += 1) {
    await expect(choices.nth(index)).toBeVisible();
  }

  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".neighbor-choice")];
    const next = document.querySelector<HTMLElement>(".neighbor-next");
    return {
      cardBottoms: cards.map((card) => Math.round(card.getBoundingClientRect().bottom)),
      cardWidths: cards.map((card) => Math.round(card.getBoundingClientRect().width)),
      nextBottom: next ? Math.round(next.getBoundingClientRect().bottom) : null,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
    };
  });

  expect(Math.max(...layout.cardBottoms)).toBeLessThanOrEqual(layout.viewportHeight);
  expect(Math.min(...layout.cardWidths)).toBeGreaterThan(80);
  expect(layout.nextBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.documentHeight).toBe(layout.viewportHeight);

  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    const descriptions = await page.locator(".neighbor-description").evaluateAll((elements) => (
      elements.map((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        text: element.textContent?.trim() ?? "",
      }))
    ));
    expect(descriptions).toHaveLength(5);
    expect(descriptions.every(({ text }) => text.length > 0)).toBe(true);
    expect(descriptions.every(({ text }) => /[\u3400-\u9fff]/.test(text))).toBe(true);
    expect(descriptions.every(({ text }) => !/[A-Za-z]{3}/.test(text))).toBe(true);
    expect(descriptions.every(({ clientHeight, scrollHeight }) => scrollHeight <= clientHeight + 1)).toBe(true);

    if (pageIndex < 3) await page.locator(".neighbor-next").click();
  }
});
