import { prisma } from "../prisma.js";

export interface IngestInput {
  fileId: string;
  caption?: string | null;
  duration?: number | null;
}

export interface IngestResult {
  status: "created" | "exists" | "error";
  code?: number;
  title?: string;
  message?: string;
}

/** Caption'dan kod (#123) va nom ajratadi */
function parseCaption(caption?: string | null): { code: number | null; title: string } {
  const text = (caption ?? "").trim();
  // Birinchi #<raqam> — kod
  const codeMatch = text.match(/#(\d{1,7})\b/);
  const code = codeMatch ? Number(codeMatch[1]) : null;
  // Hashtag va ortiqcha belgilarni olib tashlaymiz → nom
  const cleaned = text
    .replace(/#[^\s#]+/g, " ")       // hashtaglar
    .replace(/https?:\/\/\S+/g, " ") // havolalar
    .replace(/\s+/g, " ")
    .trim();
  const title = (cleaned.split("\n")[0] || cleaned || "Nomsiz").slice(0, 100);
  return { code, title };
}

async function nextFreeCode(): Promise<number> {
  const max = await prisma.movie.aggregate({ _max: { code: true } });
  return (max._max.code ?? 0) + 1;
}

/**
 * Video kinoni bazaga indekslaydi. Kod caption'da bo'lsa o'shani, bo'lmasa
 * avtomatik keyingi bo'sh kodni oladi. Kod band bo'lsa — o'tkazib yuboradi.
 */
export async function indexVideoMovie(input: IngestInput): Promise<IngestResult> {
  try {
    const { code: parsedCode, title } = parseCaption(input.caption);

    let code = parsedCode;
    if (code !== null) {
      const exists = await prisma.movie.findUnique({ where: { code } });
      if (exists) return { status: "exists", code, title: exists.title };
    } else {
      code = await nextFreeCode();
    }

    const movie = await prisma.movie.create({
      data: {
        code,
        title,
        fileId: input.fileId,
        duration: input.duration ?? null,
        caption: input.caption?.slice(0, 500) ?? null,
      },
    });
    return { status: "created", code: movie.code, title: movie.title };
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }
}
