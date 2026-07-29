/**
 * Text chunking for RAG.
 *
 * LEARNING: Overlapping chunks preserve context across boundaries. Page markers
 * from PDF extraction enable citation by page. See LEARNING.md § Chunking.
 */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export type TextChunk = {
  content: string;
  page: number;
  chunkIndex: number;
};

export async function chunkDocumentText(rawText: string): Promise<TextChunk[]> {
  const pages = splitByPageMarkers(rawText);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 900,
    chunkOverlap: 150,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const chunks: TextChunk[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    const parts = await splitter.splitText(page.content);
    for (const content of parts) {
      const trimmed = content.trim();
      if (!trimmed) continue;
      chunks.push({ content: trimmed, page: page.page, chunkIndex: globalIndex });
      globalIndex += 1;
    }
  }

  return chunks;
}

function splitByPageMarkers(rawText: string): Array<{ page: number; content: string }> {
  const pattern = /\n\n--- page (\d+) ---\n\n/g;
  const matches = [...rawText.matchAll(pattern)];

  if (matches.length === 0) {
    return [{ page: 1, content: rawText.trim() }];
  }

  const pages: Array<{ page: number; content: string }> = [];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    if (!match || match.index === undefined) continue;
    const page = Number(match[1]);
    const start = match.index + match[0].length;
    const end = matches[i + 1]?.index ?? rawText.length;
    const content = rawText.slice(start, end).trim();
    if (content) pages.push({ page, content });
  }

  return pages.length > 0 ? pages : [{ page: 1, content: rawText.trim() }];
}
