"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  Zap,
  X,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FolderOpen,
  Loader2,
  FileSearch,
  Inbox,
  FolderTree,
} from "lucide-react";

/* ========================================
   TYPES
   ======================================== */

interface ScanResult {
  fileName: string;
  filePath: string;
  machine: string;
  dateFolder: string;
  fileSize: number;
  pageCount?: number;
  status: "processed" | "error" | "skipped";
  found: boolean;
  matchCount: number;
  contexts: string[];
  error?: string;
}

interface ResolvedFile {
  file: File;
  machine: string;
  dateFolder: string;
  fullPath: string;
}

/* ========================================
   UTILS
   ======================================== */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function highlightMatch(text: string, term: string): string {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.replace(
    regex,
    '<mark class="bg-blue-500/30 text-blue-400 px-0.5 rounded">$1</mark>'
  );
}

/**
 * Sprawdza czy nazwa folderu wygląda jak data (YYYY-MM-DD)
 */
function isDateFolder(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

/**
 * Sprawdza czy nazwa folderu wygląda jak rok (YYYY)
 */
function isYearFolder(name: string): boolean {
  return /^\d{4}$/.test(name);
}

function isInstallationFolder(name: string): boolean {
  return /^\d+$/.test(name);
}

/**
 * Analizuje pliki z webkitRelativePath i zwraca tylko PDFy
 * z najnowszego folderu dat dla każdej maszyny.
 *
 * Struktura:
 *   root / INSTALACJA(cyfry) / machine / [YYYY] / YYYY-MM-DD / file.pdf
 *
 * - Bierze tylko foldery instalacji o nazwach z samych cyfr (450, 920, 1300)
 * - Pomija np. "zdjecia", "remont"
 * - Dla każdej maszyny wybiera najnowszą datę
 */
function resolveLatestFiles(allFiles: File[]): ResolvedFile[] {
  // Grupuj pliki wg "instalacja + maszyna"
  const groupMap = new Map<
    string,
    {
      installation: string;
      machine: string;
      file: File;
      pathParts: string[];
      fullPath: string;
    }[]
  >();

  for (const file of allFiles) {
    if (!file.name.toLowerCase().endsWith(".pdf")) continue;

    const relPath = (file as any).webkitRelativePath || file.name;
    const parts = relPath.split("/").filter(Boolean);

    // Potrzebujemy minimum: root/installation/machine/.../file.pdf
    if (parts.length < 4) continue;

    // parts[0] = root (folder główny wybrany przez usera)
    // parts[1] = instalacja (musi być same cyfry!)
    // parts[2] = machine (np. "K1", "K2A")
    const installation = parts[1];
    const machine = parts[2];

    // ❌ Pomijamy foldery instalacji które NIE są samymi cyframi
    if (!isInstallationFolder(installation)) {
      continue;
    }

    const groupKey = `${installation}__${machine}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }
    groupMap.get(groupKey)!.push({
      installation,
      machine,
      file,
      pathParts: parts,
      fullPath: relPath,
    });
  }

  const resolvedFiles: ResolvedFile[] = [];

  for (const [, files] of groupMap) {
    const dateEntries: {
      dateStr: string;
      file: File;
      fullPath: string;
      dateFolder: string;
      installation: string;
      machine: string;
    }[] = [];

    for (const { installation, machine, file, pathParts, fullPath } of files) {
      // pathParts: [root, installation, machine, ...middle..., filename.pdf]
      const middle = pathParts.slice(3, -1); // między machine a filename

      let dateStr = "";
      let dateFolder = "";

      if (
        middle.length === 2 &&
        isYearFolder(middle[0]) &&
        isDateFolder(middle[1])
      ) {
        // machine/2026/2026-03-15/
        dateStr = middle[1];
        dateFolder = `${middle[0]}/${middle[1]}`;
      } else if (middle.length === 1 && isDateFolder(middle[0])) {
        // machine/2026-03-15/
        dateStr = middle[0];
        dateFolder = middle[0];
      } else if (middle.length === 1 && isYearFolder(middle[0])) {
        // machine/2026/ (pliki bezpośrednio w roku)
        dateStr = middle[0] + "-12-31";
        dateFolder = middle[0];
      } else {
        // Nierozpoznana struktura — weź i tak
        dateStr = middle.join("/");
        dateFolder = middle.join("/");
      }

      dateEntries.push({
        dateStr,
        file,
        fullPath,
        dateFolder,
        installation,
        machine,
      });
    }

    if (dateEntries.length === 0) continue;

    // Znajdź najnowszą datę dla tej grupy
    const sortedDates = [
      ...new Set(dateEntries.map((e) => e.dateStr)),
    ].sort();
    const latestDate = sortedDates[sortedDates.length - 1];

    // Weź tylko pliki z najnowszą datą
    const latestFiles = dateEntries.filter((e) => e.dateStr === latestDate);

    for (const entry of latestFiles) {
      resolvedFiles.push({
        file: entry.file,
        machine: `${entry.installation}/${entry.machine}`, // pokaż instalację + maszynę
        dateFolder: entry.dateFolder,
        fullPath: entry.fullPath,
      });
    }
  }

  return resolvedFiles;
}

/* ========================================
   MAIN COMPONENT
   ======================================== */

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [resolvedFiles, setResolvedFiles] = useState<ResolvedFile[]>([]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [folderName, setFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const allFiles = Array.from(selectedFiles);

    // Pobierz nazwę root folderu
    const firstPath = (allFiles[0] as any).webkitRelativePath || "";
    const rootName = firstPath.split("/")[0] || "Selected folder";
    setFolderName(rootName);

    // Debug
    console.log("All files from folder:", allFiles.length);
    console.log(
      "Sample paths:",
      allFiles.slice(0, 10).map((f) => (f as any).webkitRelativePath)
    );

    // Rozwiąż strukturę i wybierz najnowsze
    const resolved = resolveLatestFiles(allFiles);

    console.log("Resolved files (latest per machine):", resolved.length);
    console.log(
      "Details:",
      resolved.map((r) => ({
        machine: r.machine,
        dateFolder: r.dateFolder,
        file: r.file.name,
      }))
    );

    setResolvedFiles(resolved);
    setResults([]);
  };

  const clearAll = () => {
    setResolvedFiles([]);
    setResults([]);
    setProgress({ current: 0, total: 0 });
    setFolderName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const scanFiles = async () => {
    if (!searchTerm.trim() || resolvedFiles.length === 0) return;
  
    setIsScanning(true);
    setResults([]);
    setActiveTab("all");
  
    const BATCH_SIZE = 30;
    const MAX_CONCURRENT = 5; // max 5 requestów naraz
    const total = resolvedFiles.length;
    let completedCount = 0;
  
    setProgress({ current: 0, total });
  
    // Przygotuj batche
    const batches: ResolvedFile[][] = [];
    for (let i = 0; i < total; i += BATCH_SIZE) {
      batches.push(resolvedFiles.slice(i, i + BATCH_SIZE));
    }
  
    const allResults: ScanResult[] = new Array(total);
  
    // Przetwarzaj batch
    const processBatch = async (batch: ResolvedFile[], batchIndex: number) => {
      const formData = new FormData();
      formData.append("searchTerm", searchTerm.trim());
      batch.forEach((rf) => formData.append("files", rf.file));
      formData.append(
        "metadata",
        JSON.stringify(
          batch.map((rf) => ({
            machine: rf.machine,
            dateFolder: rf.dateFolder,
            fullPath: rf.fullPath,
          }))
        )
      );
  
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          body: formData,
        });
  
        if (res.ok) {
          const data = await res.json();
          return data.results as ScanResult[];
        } else {
          const err = await res.json();
          return batch.map((rf) => ({
            fileName: rf.file.name,
            filePath: rf.fullPath,
            machine: rf.machine,
            dateFolder: rf.dateFolder,
            fileSize: rf.file.size,
            status: "error" as const,
            found: false,
            matchCount: 0,
            contexts: [] as string[],
            error: err.error || "Request failed",
          }));
        }
      } catch (err) {
        return batch.map((rf) => ({
          fileName: rf.file.name,
          filePath: rf.fullPath,
          machine: rf.machine,
          dateFolder: rf.dateFolder,
          fileSize: rf.file.size,
          status: "error" as const,
          found: false,
          matchCount: 0,
          contexts: [] as string[],
          error: err instanceof Error ? err.message : "Network error",
        }));
      }
    };
  
    // Kolejka z limitem współbieżności
    let nextBatchIndex = 0;
  
    const runNext = async (): Promise<void> => {
      while (nextBatchIndex < batches.length) {
        const currentIndex = nextBatchIndex;
        nextBatchIndex++;
  
        const batch = batches[currentIndex];
        const startIdx = currentIndex * BATCH_SIZE;
        const batchResults = await processBatch(batch, currentIndex);
  
        // Wstaw wyniki na właściwe pozycje
        batchResults.forEach((result, i) => {
          allResults[startIdx + i] = result;
        });
  
        completedCount += batch.length;
        setProgress({ current: completedCount, total });
  
        // Aktualizuj wyniki na bieżąco (pokaż co już jest)
        setResults([...allResults.filter(Boolean)]);
      }
    };
  
    // Odpal MAX_CONCURRENT workerów równolegle
    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT, batches.length) },
      () => runNext()
    );
  
    await Promise.all(workers);
  
    // Finalne wyniki
    const finalResults = allResults.filter(Boolean);
    setResults(finalResults);
    setProgress({ current: total, total });
    setIsScanning(false);
  
    if (finalResults.some((r) => r.found)) {
      setActiveTab("found");
    }
  };

  const foundResults = results.filter((r) => r.found);
  const processedCount = results.filter((r) => r.status === "processed").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  // Grupuj resolved files wg maszyny
  const machineGroups = resolvedFiles.reduce(
    (acc, rf) => {
      if (!acc[rf.machine]) acc[rf.machine] = [];
      acc[rf.machine].push(rf);
      return acc;
    },
    {} as Record<string, ResolvedFile[]>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* ===== HEADER ===== */}
        <div className="mb-8 text-center">
          <h1 className="mb-1 text-3xl font-bold tracking-tight">
            <span className="mr-2">📋</span>
            <span className="text-blue-500">BN3500</span> Protocols Scanner
          </h1>
          <p className="text-sm text-muted-foreground">
            Select protocol folders · automatically finds latest date · scans
            PDFs for text
          </p>
        </div>

        {/* ===== DROP ZONE ===== */}
        <div
          className={`relative mb-6 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-500/5"
              : "border-border hover:border-muted-foreground/50"
          }`}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            // Drop nie obsługuje webkitdirectory, więc tylko click
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
        >
          {/* @ts-expect-error webkitdirectory is non-standard */}
          <input
            ref={fileInputRef}
            type="file"
            webkitdirectory=""
            multiple
            className="absolute inset-0 z-10 cursor-pointer opacity-0"
            onChange={(e) => handleFolderSelect(e.target.files)}
          />

          <FolderTree className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            Click to select a protocol folder
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {resolvedFiles.length > 0
              ? `📁 ${folderName} · ${Object.keys(machineGroups).length} machines · ${resolvedFiles.length} PDFs from latest dates`
              : "Select root folder (e.g. Protokoły/) — app will auto-detect machines and latest dates"}
          </p>
        </div>

        {/* ===== CONTROLS ===== */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder='Enter search phrase, e.g. "G04R03GN"'
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") scanFiles();
              }}
            />
          </div>

          <Button
            onClick={scanFiles}
            disabled={
              isScanning || !searchTerm.trim() || resolvedFiles.length === 0
            }
            className="gap-2"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Scan
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={clearAll}
            disabled={isScanning || resolvedFiles.length === 0}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>

        {/* ===== PROGRESS ===== */}
        {isScanning && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="mb-2 flex justify-between text-sm text-muted-foreground">
                <span>Processing files...</span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <Progress
                value={
                  progress.total > 0
                    ? (progress.current / progress.total) * 100
                    : 0
                }
              />
            </CardContent>
          </Card>
        )}

        {/* ===== STATS ===== */}
        {results.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Total: {results.length}
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Processed: {processedCount}
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
              Matches: {foundResults.length}
            </Badge>
            {errorCount > 0 && (
              <Badge variant="destructive" className="gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Errors: {errorCount}
              </Badge>
            )}
          </div>
        )}

        {/* ===== TABS ===== */}
        {(resolvedFiles.length > 0 || results.length > 0) && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all" className="gap-2">
                <FileText className="h-4 w-4" />
                All Files
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-[20px] justify-center px-1.5 text-xs"
                >
                  {results.length > 0 ? results.length : resolvedFiles.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="found" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Found Matches
                <Badge
                  variant={foundResults.length > 0 ? "default" : "secondary"}
                  className={`ml-1 h-5 min-w-[20px] justify-center px-1.5 text-xs ${
                    foundResults.length > 0 ? "bg-green-600 text-white" : ""
                  }`}
                >
                  {foundResults.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* --- TAB: ALL FILES --- */}
            <TabsContent value="all">
              <Card>
                <CardContent className="max-h-[60vh] overflow-y-auto p-2">
                  {results.length === 0 ? (
                    resolvedFiles.length > 0 ? (
                      <div className="divide-y divide-border">
                        {resolvedFiles.map((rf, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 px-3 py-3"
                          >
                            <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {rf.file.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rf.machine} / {rf.dateFolder} ·{" "}
                                {formatFileSize(rf.file.size)}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              Ready
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={
                          <Inbox className="h-12 w-12 text-muted-foreground/30" />
                        }
                        title="No files loaded"
                        description="Select a protocol folder above"
                      />
                    )
                  ) : (
                    <div className="divide-y divide-border">
                      {results.map((result, idx) => (
                        <FileResultItem
                          key={idx}
                          result={result}
                          searchTerm={searchTerm}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- TAB: FOUND --- */}
            <TabsContent value="found">
              <Card>
                <CardContent className="max-h-[60vh] overflow-y-auto p-2">
                  {foundResults.length === 0 ? (
                    <EmptyState
                      icon={
                        results.length === 0 ? (
                          <FileSearch className="h-12 w-12 text-muted-foreground/30" />
                        ) : (
                          <Inbox className="h-12 w-12 text-muted-foreground/30" />
                        )
                      }
                      title={
                        results.length === 0
                          ? "No scan performed yet"
                          : "No matches found"
                      }
                      description={
                        results.length === 0
                          ? "Enter a search term and click Scan"
                          : `None of the ${results.length} files contain "${searchTerm}"`
                      }
                    />
                  ) : (
                    <div className="divide-y divide-border">
                      {foundResults.map((result, idx) => (
                        <FileResultItem
                          key={idx}
                          result={result}
                          searchTerm={searchTerm}
                          showAllContexts
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* ===== EMPTY STATE ===== */}
        {resolvedFiles.length === 0 && results.length === 0 && (
          <Card>
            <CardContent className="py-16">
              <EmptyState
                icon={
                  <Inbox className="h-12 w-12 text-muted-foreground/30" />
                }
                title="No folder selected"
                description="Click the area above to select a protocol folder"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ========================================
   SUB-COMPONENTS
   ======================================== */

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon}
      <h3 className="mt-4 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
    </div>
  );
}

function FileResultItem({
  result,
  searchTerm,
  showAllContexts = false,
}: {
  result: ScanResult;
  searchTerm: string;
  showAllContexts?: boolean;
}) {
  const contexts = showAllContexts
    ? result.contexts
    : result.contexts.slice(0, 1);

  return (
    <div className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/50">
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0">
        {result.status === "error" ? (
          <XCircle className="h-5 w-5 text-red-500" />
        ) : result.found ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{result.fileName}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-blue-400">{result.machine}</span>
          {" / "}
          {result.dateFolder} · {formatFileSize(result.fileSize)}
          {result.pageCount != null && ` · ${result.pageCount} pages`}
          {result.error && (
            <span className="text-red-400"> · {result.error}</span>
          )}
        </p>

        {/* Context snippets */}
        {result.found && contexts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {contexts.map((ctx, ci) => (
              <div
                key={ci}
                className="rounded-md border border-border bg-background p-2 text-xs leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: highlightMatch(ctx, searchTerm),
                }}
              />
            ))}
            <p className="text-[11px] text-muted-foreground/60">
              {result.matchCount} occurrence
              {result.matchCount !== 1 ? "s" : ""} found
            </p>
          </div>
        )}
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0">
        {result.status === "error" ? (
          <Badge variant="destructive" className="gap-1 text-xs">
            <AlertCircle className="h-3 w-3" />
            Error
          </Badge>
        ) : result.found ? (
          <Badge className="gap-1 bg-green-600 text-xs text-white hover:bg-green-700">
            <CheckCircle2 className="h-3 w-3" />
            {result.matchCount}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            No match
          </Badge>
        )}
      </div>
    </div>
  );
}