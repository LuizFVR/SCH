import { NextResponse } from "next/server";
import { adminUrl } from "../../../../lib/admin-url";
import { deleteSession } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await deleteSession();
  return NextResponse.redirect(adminUrl("/login", request), 303);
}
