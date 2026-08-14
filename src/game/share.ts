interface ChallengeShareTextOptions {
  startName: string;
  targetName: string;
  steps: number;
  won: boolean;
  url: string;
}

export function buildPathShareText(names: string[]): string {
  return names.join("->");
}

export function buildChallengeShareText({
  startName,
  targetName,
  steps,
  won,
  url,
}: ChallengeShareTextOptions): string {
  if (won) {
    return `我从【${startName}】走到【${targetName}】花了${steps}步，（如果愿意的话）请试试看：${url}`;
  }
  return `【${startName}】走到【${targetName}】，我花了${steps}步还没有走到，（如果愿意的话）请试试看：${url}`;
}
