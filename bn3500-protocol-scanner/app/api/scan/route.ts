import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const searchTerm = formData.get("searchTerm") as string;
    const files = formData.getAll("files") as File[];

    if (!searchTerm?.trim()) {
      return NextResponse.json(
        { error: "Search term is required" },
        { status: 400 }
      );
    }

    if (!files?.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const pdfParse = (await import("pdf-parse")).default;

    const results = [];

    for (const file of files) {
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        results.push({
          fileName: file.name,
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
        const buffer = Buffer.from(arrayBuffer);
        const pdfData = await pdfParse(buffer);
        const text = pdfData.text;

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
              const end = Math.min(text.length, pos + searchTerm.length + 80);
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
          fileSize: file.size,
          pageCount: pdfData.numpages,
          status: "processed" as const,
          found,
          matchCount,
          contexts,
        });
      } catch (err) {
        results.push({
          fileName: file.name,
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
