import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveBackendBaseUrl(): string {
  const candidates = [
    process.env.BACKEND_URL,
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && /^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/\/+$/, "").replace(/\/api$/i, "");
    }
  }
  return "http://127.0.0.1:4000";
}

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  const backendBase = resolveBackendBaseUrl();
  const targetPath = `/api/${(path || []).join("/")}`;
  const targetUrl = `${backendBase}${targetPath}${req.nextUrl.search}`;

  const headers = new Headers();
  const forwardHeaders = ["authorization", "cookie", "content-type", "accept"];
  for (const name of forwardHeaders) {
    const val = req.headers.get(name);
    if (val) headers.set(name, val);
  }
  const host = req.headers.get("host");
  if (host) headers.set("x-forwarded-host", host);
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  if (proto) headers.set("x-forwarded-proto", proto);

  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
      redirect: "manual",
    });

    const respHeaders = new Headers();
    const copyHeaders = ["content-type", "content-disposition", "cache-control"];
    for (const name of copyHeaders) {
      const val = upstream.headers.get(name);
      if (val) respHeaders.set(name, val);
    }

    const getSetCookie = (
      upstream.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie;
    if (typeof getSetCookie === "function") {
      for (const cookie of getSetCookie.call(upstream.headers)) {
        respHeaders.append("set-cookie", cookie);
      }
    } else {
      const setCookie = upstream.headers.get("set-cookie");
      if (setCookie) respHeaders.set("set-cookie", setCookie);
    }

    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Erreur réseau";
    return NextResponse.json(
      {
        message:
          "Serveur backend API injoignable. Vérifiez BACKEND_URL / NEXT_PUBLIC_API_URL et l'état du service backend.",
        detail,
      },
      { status: 503 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function OPTIONS(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}
