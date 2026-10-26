import { buildWorkbook, workbookFilename } from "@/lib/excel";
import { IngestError } from "@/lib/errors";
import { readExportRequest } from "@/lib/videos";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  try {
    const { channelTitle, videos } = readExportRequest(body);
    const file = await buildWorkbook(videos);
    const filename = workbookFilename(channelTitle);
    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof IngestError ? error.message : "Could not create the Excel file.";
    const status = error instanceof IngestError ? error.status : 500;
    return Response.json({ error: message }, { status });
  }
}
