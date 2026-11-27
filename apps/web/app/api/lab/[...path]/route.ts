import { providerSchema } from "@nepal-payment-lab/shared";
import { fetchLab } from "@/lib/lab-server";

const routes = providerSchema.options.flatMap((provider) => [
  { path: `providers/${provider}`, methods: ["GET", "PATCH"] },
  {
    path: `providers/${provider}/credentials`,
    methods: ["POST", "DELETE"],
  },
]);

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, { params }: Context) {
  const path = (await params).path.join("/");
  if (
    !routes.some(
      (route) => route.path === path && route.methods.includes(request.method),
    )
  )
    return Response.json(
      { kind: "not_found", message: "Route not found." },
      { status: 404 },
    );
  const host = request.headers.get("host");
  if (
    request.method !== "GET" &&
    (!host ||
      request.headers.get("origin") !==
        `${new URL(request.url).protocol}//${host}`)
  )
    return Response.json(
      { kind: "forbidden", message: "Send this request from the app." },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length")) > 16384)
    return Response.json(
      { kind: "too_large", message: "Request is too large." },
      { status: 413 },
    );
  try {
    const body = ["POST", "PATCH"].includes(request.method)
      ? await request.text()
      : undefined;
    if (body && new TextEncoder().encode(body).length > 16384)
      return Response.json(
        { kind: "too_large", message: "Request is too large." },
        { status: 413 },
      );
    const response = await fetchLab(`/v1/${path}`, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body } : {}),
    });

    return new Response(
      response.status === 204 ? null : await response.text(),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        kind: "unavailable",
        message: "The lab API is unavailable. Try again shortly.",
      },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
