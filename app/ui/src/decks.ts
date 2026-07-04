type DeckDescription = {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  summary?: unknown;
};

export type Deck = {
  slug: string;
  name: string;
  description: string;
  fens: string[];
  previewFen: string;
  accentColor: string;
};

const fenFiles = import.meta.glob("../../fen/*/*.fen", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const descriptionFiles = import.meta.glob("../../fen/*/description.json", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function deckSlugFromPath(path: string): string | undefined {
  return path.match(/\.\.\/\.\.\/fen\/([^/]+)\//)?.[1];
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseDescription(raw: string | undefined): DeckDescription | undefined {
  if (!raw?.trim()) return undefined;

  try {
    return JSON.parse(raw) as DeckDescription;
  } catch {
    return undefined;
  }
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pastelForSlug(slug: string): string {
  let hash = 0;
  for (const character of slug) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }

  return `hsl(${hash} 68% 84%)`;
}

const descriptionsBySlug = Object.fromEntries(
  Object.entries(descriptionFiles).flatMap(([path, raw]) => {
    const slug = deckSlugFromPath(path);
    return slug ? [[slug, parseDescription(raw)]] : [];
  }),
);

const fensBySlug = Object.entries(fenFiles).reduce<Record<string, string[]>>((decks, [path, raw]) => {
  const slug = deckSlugFromPath(path);
  if (!slug) return decks;

  const fens = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  decks[slug] = [...(decks[slug] ?? []), ...fens];
  return decks;
}, {});

export const decks: Deck[] = Object.entries(fensBySlug)
  .flatMap(([slug, fens]) => {
    const previewFen = fens[0];
    if (!previewFen) return [];

    const description = descriptionsBySlug[slug];
    const name = textValue(description?.name) ?? textValue(description?.title) ?? titleFromSlug(slug);
    const summary =
      textValue(description?.description) ??
      textValue(description?.summary) ??
      `${fens.length} positions loaded from the ${name} deck.`;

    return [
      {
        slug,
        name,
        description: summary,
        fens,
        previewFen,
        accentColor: pastelForSlug(slug),
      },
    ];
  })
  .sort((left, right) => left.name.localeCompare(right.name));
