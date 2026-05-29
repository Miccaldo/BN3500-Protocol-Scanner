import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const searchTerm = formData.get("searchTerm") as string;
    const files = formData.getAll("files") as File[];
    const metadataRaw = formData.get("metadata") as string;

    if (!searchTerm?.trim()) {
      return NextResponse.json(
        { error: "Search term is required" },
        { status: 400 }
      );
    }

    if (!files?.length) {
      return NextResponse.json(
        { error: "No files uploaded" },
        { status: 400 }
      );
    }

    // Parsuj metadane (machine, dateFolder, fullPath)
    let metadata: { machine: string; dateFolder: string; fullPath: string }[] =
      [];
    try {
      if (metadataRaw) {
        metadata = JSON.parse(metadataRaw);
      }
    } catch {
      // Jeśli nie parsuje — ignorujemy, użyjemy defaults
    }

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metadata[i] || {
        machine: "unknown",
        dateFolder: "unknown",
        fullPath: file.name,
      };

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        results.push({
          fileName: file.name,
          filePath: meta.fullPath,
          machine: meta.machine,
          dateFolder: meta.dateFolder,
          fileSize: file.size,
          status: "skipped" as const,
          error: "Not a PDF file",
          found: false,
          matchCount: 0,
          contexts: [] as string[],
        });
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        const pdf = await getDocumentProxy(buffer);
        const { text } = await extractText(pdf, { mergePages: true });

        const searchLower = searchTerm.toLowerCase();
        const textLower = text.toLowerCase();
        const found = textLower.includes(searchLower);

        let matchCount = 0;
        const contexts: string[] = [];

        if (found) {
          let pos = 0;
          while ((pos = textLower.indexOf(searchLower, pos)) !== -1) {
            matchCount++;

            if (contexts.length < 3) {
              const start = Math.max(0, pos - 80);
              const end = Math.min(
                text.length,
                pos + searchTerm.length + 80
              );
              let ctx = text.substring(start, end).trim();
              ctx = ctx.replace(/\n+/g, " ").replace(/\s+/g, " ");
              if (start > 0) ctx = "..." + ctx;
              if (end < text.length) ctx = ctx + "...";
              contexts.push(ctx);
            }

            pos += searchTerm.length;
          }
        }

        results.push({
          fileName: file.name,
          filePath: meta.fullPath,
          machine: meta.machine,
          dateFolder: meta.dateFolder,
          fileSize: file.size,
          pageCount: pdf.numPages,
          status: "processed" as const,
          found,
          matchCount,
          contexts,
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          filePath: meta.fullPath,
          machine: meta.machine,
          dateFolder: meta.dateFolder,
          fileSize: file.size,
          status: "error" as const,
          error: err instanceof Error ? err.message : "Unknown error",
          found: false,
          matchCount: 0,
          contexts: [] as string[],
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}