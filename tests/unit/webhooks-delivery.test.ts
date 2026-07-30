import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "./helpers/twoTenants";
import { createWebhookEndpoint, listWebhookDeliveries } from "@/lib/db/queries/webhooks";
import { fireWebhookEvent } from "@/lib/webhooks/dispatch";
import { WebhookEndpoint } from "@/lib/db/models/WebhookEndpoint";
import { WebhookDelivery } from "@/lib/db/models/WebhookDelivery";

type CapturedRequest = { headers: Record<string, string | string[] | undefined>; body: string };

function waitForRequest(server: Server): Promise<CapturedRequest> {
  return new Promise((resolve) => {
    server.once("request", (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
        resolve({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
  });
}

describe("webhook delivery", () => {
  let tenants: TwoTenants;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    tenants = await setupTwoTenants("webhooks-delivery");
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("failed to bind test server");
    port = address.port;
  });

  afterEach(async () => {
    await Promise.all([
      WebhookEndpoint.deleteMany({ businessId: tenants.businessAId }),
      WebhookDelivery.deleteMany({ businessId: tenants.businessAId }),
    ]);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await teardownTwoTenants(tenants);
  });

  it("signs the delivered payload with the endpoint's own secret (HMAC-SHA256) and records a success", async () => {
    const { endpoint, secret } = await createWebhookEndpoint({
      businessId: tenants.businessAId,
      url: `http://127.0.0.1:${port}/hook`,
      eventTypes: ["invoice.created"],
      createdByUserId: tenants.userAId,
    });

    const received = waitForRequest(server);
    await fireWebhookEvent(tenants.businessAId, "invoice.created", { invoiceId: "abc123" });
    const request = await received;

    const signatureHeader = request.headers["x-webhook-signature"];
    expect(signatureHeader).toBeDefined();
    const expected = `sha256=${createHmac("sha256", secret).update(request.body).digest("hex")}`;
    expect(signatureHeader).toBe(expected);

    // A different secret must NOT verify — proves the signature is actually keyed on this
    // endpoint's secret and not some fixed/global value.
    const wrongSignature = `sha256=${createHmac("sha256", "wrong-secret").update(request.body).digest("hex")}`;
    expect(signatureHeader).not.toBe(wrongSignature);

    const parsedBody = JSON.parse(request.body);
    expect(parsedBody.type).toBe("invoice.created");
    expect(parsedBody.data).toEqual({ invoiceId: "abc123" });

    const { items } = await listWebhookDeliveries(String(endpoint._id), tenants.businessAId);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("success");
    expect(items[0].attempts).toBe(1);
  });

  it("never subscribes to an event it wasn't registered for", async () => {
    await createWebhookEndpoint({
      businessId: tenants.businessAId,
      url: `http://127.0.0.1:${port}/hook`,
      eventTypes: ["invoice.payment_received"],
      createdByUserId: tenants.userAId,
    });

    const gotRequest = waitForRequest(server);
    const timedOut = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500));

    await fireWebhookEvent(tenants.businessAId, "invoice.created", { invoiceId: "should-not-deliver" });
    const outcome = await Promise.race([gotRequest.then(() => "delivered" as const), timedOut]);
    expect(outcome).toBe("timeout");
  });

  it("retries against an unreachable endpoint, records a failed delivery, and never throws", async () => {
    // Nothing listens on this port — connection refused on every attempt.
    const { endpoint } = await createWebhookEndpoint({
      businessId: tenants.businessAId,
      url: "http://127.0.0.1:1/unreachable",
      eventTypes: ["invoice.created"],
      createdByUserId: tenants.userAId,
    });

    await expect(
      fireWebhookEvent(tenants.businessAId, "invoice.created", { invoiceId: "xyz" }),
    ).resolves.toBeUndefined();

    const { items } = await listWebhookDeliveries(String(endpoint._id), tenants.businessAId);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("failed");
    expect(items[0].attempts).toBe(3);
  }, 15_000);
});
