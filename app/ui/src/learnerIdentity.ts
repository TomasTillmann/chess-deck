const learnerKey = "woodpecker.learnerId";

export function learnerId(): string {
  // Keep the existing anonymous identity so reviews and views share one learner.
  const stored = localStorage.getItem(learnerKey);
  if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(learnerKey, id);
  return id;
}
