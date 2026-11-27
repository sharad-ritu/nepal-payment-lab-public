import {
  apiErrorSchema,
  checkoutSelectionSchema,
  checkoutTokenSchema,
} from "@nepal-payment-lab/shared";
import { fetchLab } from "@/lib/lab-server";

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Checkout sets Referrer-Policy: no-referrer, so the return form navigates
// with Origin: null. Treat that like a missing origin and fall back to the
// referer, then Fetch Metadata. A cross-site post still sends a real origin
// or Sec-Fetch-Site: cross-site.
function isCheckoutSubmission(request: Request) {
  const host = request.headers.get("host");
  if (!host) return false;

  const expectedOrigin = `${new URL(request.url).protocol}//${host}`;
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") return origin === expectedOrigin;

  const referer = request.headers.get("referer");
  if (referer) return originOf(referer) === expectedOrigin;

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || ["same-origin", "same-site", "none"].includes(fetchSite);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!checkoutTokenSchema.safeParse(token).success)
    return new Response("Checkout not found.", { status: 404 });

  if (!isCheckoutSubmission(request))
    return new Response("Open the checkout page to run this simulation.", {
      status: 403,
    });

  if (Number(request.headers.get("content-length")) > 1024)
    return new Response("Request is too large.", { status: 413 });

  try {
    const requestBody = await request.text();
    if (new TextEncoder().encode(requestBody).length > 1024)
      return new Response("Request is too large.", { status: 413 });

    const form = new URLSearchParams(requestBody);
    const input = checkoutSelectionSchema.safeParse({
      scenarioKey: form.get("scenarioKey"),
    });

    if (!input.success)
      return new Response("Choose a payment outcome on checkout.", {
        status: 400,
      });

    const response = await fetchLab(`/v1/checkout/${token}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

    const location = response.headers.get("location");
    if (response.status === 303 && location)
      return new Response(null, {
        status: 303,
        headers: {
          Location: location,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });

    const body = apiErrorSchema.safeParse(await response.json());

    return new Response(
      body.success
        ? body.data.message
        : "Checkout could not complete. Return to the checkout page.",
      {
        status: response.status,
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
      },
    );
  } catch {
    return new Response(
      "The lab API is unavailable. Return to checkout and try again.",
      { status: 502 },
    );
  }
}
