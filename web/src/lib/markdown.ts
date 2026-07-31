/**
 * Normalize model Markdown so headings/lists don't jam onto one line
 * (common when summarizing dense PDF assignment text).
 */
const SECTION_TITLES = [
  "Overview",
  "Core Architecture",
  "Key Technical Requirements",
  "Deliverables",
  "Summary",
  "Introduction",
  "Requirements",
  "Architecture",
  "Background",
  "Goals",
  "Tasks",
  "Setup",
  "Testing",
  "Documentation",
];

export function normalizeAssistantMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  // Ensure ATX headings start on their own line (don't split ### into # + ##)
  text = text.replace(/(?<![#\n])(#{1,6} )/g, "\n\n$1");
  text = text.replace(/^\n+/, "");

  // "### Overview The assignment..." -> heading + body
  text = text.replace(/^(#{1,6})\s+([^\n]+)$/gm, (_full, hashes: string, rest: string) => {
    const trimmed = rest.trim();
    for (const title of SECTION_TITLES) {
      const re = new RegExp(`^(${escapeRegExp(title)})\\b(?:\\s*[:—–-])?\\s*(.*)$`, "i");
      const match = trimmed.match(re);
      if (match) {
        const body = (match[2] ?? "").trim();
        if (body) return `${hashes} ${match[1]}\n\n${body}`;
        return `${hashes} ${match[1]}`;
      }
    }
    return `${hashes} ${trimmed}`;
  });

  // "Architecture * **App A**" or heading line ending then inline bullets
  text = text.replace(/([^\n*])\s+\*\s+\*\*/g, "$1\n\n- **");
  text = text.replace(/\n\*\s+\*\*/g, "\n- **");

  // Convert remaining " * " bullet runs that aren't already list items
  text = text.replace(/([^\n])\s+\*\s+(?=\*\*)/g, "$1\n- ");

  // Ensure blank line before list markers and headings that follow body text
  text = text.replace(/([^\n])\n([-*] )/g, "$1\n\n$2");
  text = text.replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2");

  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
