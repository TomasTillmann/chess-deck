export type Deck = {
  slug: string;
  name: string;
  description: string;
  fens: string[];
  previewFen: string;
  accentColor: string;
};

type CollectionResponse = {
  readonly collections?: unknown;
};

type CollectionPayload = {
  readonly slug?: unknown;
  readonly name?: unknown;
  readonly description?: unknown;
  readonly fens?: unknown;
};

const collectionsUrl = new URL(
  "/v1/collections",
  import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001",
).href;

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pastelForSlug(slug: string): string {
  let hash = 0;
  for (const character of slug) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }

  return `hsl(${hash} 68% 84%)`;
}

function isCollectionPayload(value: unknown): value is CollectionPayload {
  return typeof value === "object" && value !== null;
}

function mapCollection(value: unknown): Deck | undefined {
  if (!isCollectionPayload(value) || !Array.isArray(value.fens)) return undefined;

  const fens = value.fens.filter((fen): fen is string => typeof fen === "string" && Boolean(fen.trim()));
  const previewFen = fens[0];
  if (!previewFen) return undefined;

  const slug = textValue(value.slug) ?? "woodpecker";
  const name = textValue(value.name) ?? titleFromSlug(slug);
  const description =
    textValue(value.description) ?? `${fens.length} positions loaded from the ${name} deck.`;

  return {
    slug,
    name,
    description,
    fens,
    previewFen,
    accentColor: pastelForSlug(slug),
  };
}

export async function fetchDecks(signal?: AbortSignal): Promise<Deck[]> {
  const response = await fetch(collectionsUrl, { signal });
  if (!response.ok) throw new Error(`Failed to load collections: HTTP ${response.status}`);

  const body = (await response.json()) as CollectionResponse;
  const collections = Array.isArray(body.collections) ? body.collections : [];

  return collections.flatMap(collection => {
    const deck = mapCollection(collection);
    return deck ? [deck] : [];
  });
}
