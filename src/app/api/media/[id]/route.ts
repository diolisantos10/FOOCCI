import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// Public route — no auth required (images are referenced from public QR pages)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const record = await prisma.mediaUpload.findUnique({
      where: { id: params.id },
      select: { data: true, mimeType: true },
    });

    if (!record) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(record.data, {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
