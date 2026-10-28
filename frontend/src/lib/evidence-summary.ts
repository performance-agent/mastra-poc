// Keep this pure formatter aligned with its backend/frontend counterpart.
// Only stored attribution determines roles; lifecycle events never imply who merged or closed.
export type SummaryReference = {
  id: string;
  identifier: string;
  resourceId: string;
  recordId: string;
  role: string;
  label: string;
};

function displayTitle(reference: SummaryReference): string {
  let title = reference.label.startsWith(`${reference.role}:`)
    ? reference.label.slice(reference.role.length + 1)
    : reference.label;
  // Remove nested parenthetical metadata for display only.
  while (/\([^()]*\)/.test(title)) title = title.replace(/\([^()]*\)/g, " ");
  title = title.replace(/\s+/g, " ").trim();
  const words = title.split(" ");
  let shortened = "";
  for (const word of words.slice(0, 12)) {
    const candidate = shortened ? `${shortened} ${word}` : word;
    if (candidate.length > 59) break;
    shortened = candidate;
  }
  if (!shortened) return "a stored record";
  return shortened === title ? title : `${shortened}…`;
}

export function evidenceSummary(
  identifier: string,
  references: SummaryReference[],
  evidenceAvailability?: "available" | "partial" | "unavailable",
) {
  const own = references.filter((e) => e.identifier === identifier);
  const groups = [
    {
      verb: "Authored",
      accepts: (role: string) => role === "author" || role.startsWith("authored "),
    },
    { verb: "Reviewed", accepts: (role: string) => role === "review" },
    { verb: "Commented on", accepts: (role: string) => role === "comment" },
    { verb: "Reported", accepts: (role: string) => role === "reporter" || role === "issue author" },
    { verb: "Was assigned", accepts: (role: string) => role.startsWith("assignment") },
  ];
  let exampleCount = 0;
  const cited = new Set<string>();
  const clauses = groups.flatMap(({ verb, accepts }) => {
    const records = new Map<string, SummaryReference>();
    for (const ref of own.filter((e) => accepts(e.role))) {
      cited.add(ref.id);
      const key = JSON.stringify([ref.identifier, ref.resourceId, ref.recordId || ref.id]);
      if (!records.has(key)) records.set(key, ref);
    }
    if (!records.size) return [];
    const example = records.values().next().value!;
    if (exampleCount < 2) {
      exampleCount++;
      return [`${verb} “${displayTitle(example)}”${records.size > 1 ? " and other records" : ""}`];
    }
    return [`${verb} stored records`];
  });
  const observations = own.filter((e) => e.role === "stored guideline observation");
  observations.forEach((e) => cited.add(e.id));
  const sentences: string[] = [];
  if (clauses.length) {
    // At most two activity sentences, with every role still explicitly attributed.
    const split = Math.ceil(clauses.length / 2);
    sentences.push(`${clauses.slice(0, split).join("; ")}.`);
    if (split < clauses.length) sentences.push(`${clauses.slice(split).join("; ")}.`);
  }
  if (observations.length) sentences.push("The report also retains guideline observations.");
  const available = cited.size > 0;
  if (!available)
    sentences.push("The report has no readable, individually attributed activity to summarize.");
  if (sentences.length < 2)
    sentences.push("Supporting evidence contains the stored details and attribution limits.");
  return {
    synthesis: [{ text: sentences.join(" "), references: [...cited] }],
    nextAction: {
      text:
        !available || evidenceAvailability === "partial" || evidenceAvailability === "unavailable"
          ? "Request the missing, individually attributed records for this period."
          : "Discuss the cited activity and any blockers at the next check-in.",
      references: [...cited].slice(0, 12),
    },
    limitations: [
      "This is a factual evidence summary, not a complete performance review. Reporting, reviews, comments, and assignments are distinct from implementation; assignment does not prove completion. Activity counts do not establish performance.",
      ...(!available ? ["Readable, individually attributed evidence is unavailable."] : []),
    ],
  };
}
