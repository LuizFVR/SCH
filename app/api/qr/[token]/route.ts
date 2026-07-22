import QRCode from "qrcode";
import { getQrTarget } from "../../../../lib/survey-lifecycle";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await getQrTarget(token);
  if (!target) return new Response("QR Code não encontrado.", { status: 404 });

  const publicHost = (process.env.PUBLIC_SURVEY_HOST || new URL(request.url).origin).replace(/\/$/, "");
  const publicUrl = `${publicHost}/responder/${encodeURIComponent(token)}`;
  const png = await QRCode.toBuffer(publicUrl, {
    type: "png",
    width: 720,
    margin: 3,
    errorCorrectionLevel: "H",
    color: { dark: "#0c242d", light: "#ffffff" },
  });

  const slug = target.sectorName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      ...(download ? { "content-disposition": `attachment; filename="qr-${slug}.png"` } : {}),
    },
  });
}
