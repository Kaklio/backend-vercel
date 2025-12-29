// lib/pdfPrune.ts
export type SectionsMap = Record<string, string | undefined>;

export interface PrepareOptions {
  maxChars?: number;           // hard cap for final text (default 12000)
  minSectionLength?: number;   // ignore sections shorter than this (default 200)
  preferIntro?: boolean;       // include Introduction early if found (default true)
  keepOrder?: boolean;         // keep sections in original doc order (default true)
}

const DEFAULTS: Required<PrepareOptions> = {
  maxChars: 12000,
  minSectionLength: 200,
  preferIntro: true,
  keepOrder: true,
};

/**
 * Normalize weird headings like "a b s t r a c t" and collapse whitespace.
 */
function normalizeHeadingCandidates(text: string): string {
  // collapse multiple newlines & whitespace
  return text.replace(/\r\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
}

/**
 * Remove PDF noise, de-hyphenate split words, remove common footer/header lines.
 */
function cleanPdfNoise(raw: string): string {
  let t = raw;

  // De-hyphenate words split at line breaks: "exam-\nple" -> "example"
  t = t.replace(/-\s*\n\s*/g, "");

  // Replace line breaks inside paragraphs with a space (but keep double newlines as paragraph breaks)
  t = t.replace(/([^\n])\n([^\nA-Z0-9-])/g, "$1 $2"); // linebreaks followed by lowercase or punctuation -> join
  t = t.replace(/\n{2,}/g, "\n\n");

  // Remove common noise lines
  t = t.replace(/^Downloaded from .*$/gim, "");
  t = t.replace(/^All rights reserved.*$/gim, "");
  t = t.replace(/^©\s?\d{4}.*$/gim, "");
  t = t.replace(/^Page \d+ of \d+$/gim, "");
  t = t.replace(/^\s*This is the author version of.*$/gim, "");
  t = t.replace(/^\s*Preprint.*$/gim, "");

  // Trim long runs of whitespace
  t = t.replace(/\s{3,}/g, " ");

  return t.trim();
}

/**
 * Build regex matching flexible section headers (handles spaced letters like "a b s t r a c t")
 */
function sectionHeadingRegex(names: string[]): RegExp {
  // create pattern that accepts optional whitespace or punctuation between letters: e.g. a\s*b\s*s...
  const escaped = names.map(name => {
    const letters = name.replace(/\s+/g, "").split("").map(ch => escapeRegex(ch)).join("\\s*");
    return `(^|\\n)\\s*${letters}\\b[\\s\\S]{0,200}?\\n`; // heading start line
  });
  return new RegExp(escaped.join("|"), "gim");
}

function escapeRegex(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Find headings and their indices in text. Returns array of { key, index }.
 * key is normalized lower-case label from our canonical list.
 */
function findHeadingsPositions(text: string): { key: string; idx: number }[] {
  const canonical: Record<string, string[]> = {
    abstract: ["abstract", "a b s t r a c t", "summary"],
    introduction: ["introduction", "intro"],
    methods: ["methods", "materials and methods", "methodology", "experimental", "materials & methods"],
    results: ["results", "findings"],
    discussion: ["discussion", "discussion and conclusions", "discussion and conclusion"],
    conclusion: ["conclusion", "conclusions", "concluding remarks"],
    acknowledgements: ["acknowledgements", "acknowledgments", "acknowledgement"],
    references: ["references", "bibliography", "literature cited"],
    appendix: ["appendix", "appendices", "supplementary"],
  };

  const positions: { key: string; idx: number }[] = [];
  const lowerText = text.toLowerCase();

  // brute-force search for headings. use word boundary on first token to avoid false positives.
  for (const [key, variants] of Object.entries(canonical)) {
    for (const variant of variants) {
      // allow spaces between letters in variant (for "a b s t r a c t")
      const pattern = variant.replace(/\s+/g, "\\s*");
      const regex = new RegExp(`(^|\\n)\\s*${pattern}\\b`, "i");
      const m = regex.exec(text);
      if (m && m.index !== undefined) {
        positions.push({ key, idx: m.index });
        break; // stop on first variant match for this key
      }
    }
  }

  // sort by index ascending
  positions.sort((a, b) => a.idx - b.idx);
  return positions;
}

/**
 * Extract raw slice between two indices (handles end of doc)
 */
function sliceBetween(text: string, start: number, end?: number) {
  if (start < 0) start = 0;
  if (!end || end > text.length) end = text.length;
  return text.slice(start, end).trim();
}

/**
 * Extract sections using identified heading positions.
 */
function extractSectionsByHeadings(text: string): SectionsMap {
  const positions = findHeadingsPositions(text);
  const result: SectionsMap = {};

  if (positions.length === 0) {
    return result;
  }

  for (let i = 0; i < positions.length; i++) {
    const key = positions[i].key;
    const start = positions[i].idx;

    // find end: next heading start index or end of doc
    const end = i + 1 < positions.length ? positions[i + 1].idx : undefined;

    // capture heading line + following paragraph until next heading
    const snippet = sliceBetween(text, start, end);
    // remove the heading token itself from content (keep content)
    const firstLineBreak = snippet.indexOf("\n");
    const content = firstLineBreak === -1 ? snippet : snippet.slice(firstLineBreak + 1).trim();

    result[key] = (result[key] || "") + "\n" + content;
  }

  return result;
}

/**
 * If we didn't find headings, try to heuristically extract Abstract (short, early),
 * and Conclusion (tail).
 */
function heuristicExtract(text: string, options: Required<PrepareOptions>): SectionsMap {
  const res: SectionsMap = {};
  const cleaned = text.trim();

  // try to capture first 5k chars as candidate for abstract/intro
  const head = cleaned.slice(0, Math.min(6000, cleaned.length));
  if (head.length > options.minSectionLength) res.abstract = head;

  // tail candidate (likely contains conclusion)
  const tailStart = Math.max(0, cleaned.length - 4000);
  const tail = cleaned.slice(tailStart);
  if (tail.length > options.minSectionLength) res.conclusion = tail;

  return res;
}

/**
 * Main prepare function - returns pruned text (string) and structured sections map.
 */
export function prepareScientificPdfForLLM(rawText: string, opts?: PrepareOptions): { text: string; sections: SectionsMap } {
  const options = { ...DEFAULTS, ...(opts || {}) };

  if (!rawText || rawText.trim().length === 0) {
    return { text: "", sections: {} };
  }

  // 1) Normalize and clean noise
  let text = normalizeHeadingCandidates(rawText);
  text = cleanPdfNoise(text);

  // 2) Hard cutoff for references etc. (remove from first occurrence)
  const cutoffPatterns = [
    /\nreferences\b[\s\S]*$/i,
    /\nbibliography\b[\s\S]*$/i,
    /\nliterature cited\b[\s\S]*$/i,
    /\nacknowledg(e)?ments?\b[\s\S]*$/i,
    /\nsupplementary (material|information)\b[\s\S]*$/i,
    /\nappendix\b[\s\S]*$/i,
  ];
  for (const p of cutoffPatterns) {
    text = text.replace(p, "");
  }
  text = text.trim();

  // 3) Find and extract sections by headings
  const extracted = extractSectionsByHeadings(text);

  // 4) If we found nothing, use heuristics
  let finalSections: SectionsMap = { ...extracted };
  if (Object.keys(finalSections).length === 0) {
    const heur = heuristicExtract(text, options);
    finalSections = { ...finalSections, ...heur };
  }

  // 5) Prioritize sections we want in order
  const desiredOrder = [
    "abstract",
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusion",
  ];

  // build prioritized list of snippets (in original order or canonical order based on keepOrder setting)
  let orderedKeys: string[] = [];

  if (options.keepOrder) {
    // keep document order: use the positions order if we have heading positions
    const headingPositions = findHeadingsPositions(text);
    if (headingPositions.length) {
      orderedKeys = headingPositions.map(h => h.key).filter(k => desiredOrder.includes(k));
      // add any desired keys not present in headingPositions but found in finalSections
      for (const k of desiredOrder) {
        if (!orderedKeys.includes(k) && finalSections[k]) orderedKeys.push(k);
      }
    } else {
      orderedKeys = desiredOrder.filter(k => finalSections[k]); // fallback canonical order
    }
  } else {
    orderedKeys = desiredOrder.filter(k => finalSections[k]);
  }

  // 6) Assemble final text up to maxChars, ignore tiny sections
  let assembled = "";
  for (const key of orderedKeys) {
    const sectionText = (finalSections[key] || "").trim();
    if (!sectionText || sectionText.length < options.minSectionLength) continue;

    const header = `\n\n# ${key.toUpperCase()}\n\n`;
    const candidate = assembled + header + sectionText;

    if (candidate.length > options.maxChars) {
      // if assembled is empty, we still want to include truncated section to give some content
      if (assembled.length === 0) {
        assembled = (header + sectionText).slice(0, options.maxChars);
      }
      break;
    } else {
      assembled = candidate;
    }
  }

  // 7) Smart fallback if assembled is empty or too small:
  if (assembled.trim().length < Math.min(800, options.minSectionLength)) {
    // take head + tail approach
    const head = text.slice(0, Math.min(6000, text.length));
    const tail = text.slice(Math.max(0, text.length - 3000));
    let candidate = `# LEADING\n\n${head}\n\n# TRAILING\n\n${tail}`;
    if (candidate.length > options.maxChars) candidate = candidate.slice(0, options.maxChars);
    assembled = candidate;
  }

  // 8) Final cleanup: ensure no leading/trailing whitespace
  assembled = assembled.trim();

  // Provide structured sections (only those included or found)
  const includedSections: SectionsMap = {};
  for (const k of Object.keys(finalSections)) {
    if (finalSections[k] && finalSections[k]!.trim().length >= options.minSectionLength) {
      includedSections[k] = finalSections[k]!.trim();
    }
  }

  return { text: assembled, sections: includedSections };
}
