import { NextResponse } from "next/server";

/**
 * Hand-written OpenAPI 3.0 document for the v1 REST API — "document the REST API" from
 * project_spec.md's Integrations & Apps section. Kept in sync manually as endpoints change; there
 * is no code-generation step for it.
 */
const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "MyBilling API",
    version: "1.0.0",
    description:
      "Business-scoped REST API. Authenticate with `Authorization: Bearer <api key>` — an API " +
      "key is created under Settings → API Keys and is tied to a Role, so it can only do what " +
      "that Role is permitted to do in the UI. Rate limited to 120 requests/minute per key.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "http", scheme: "bearer", bearerFormat: "mb_live_..." },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/invoices": {
      get: {
        summary: "List invoices",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "customerId", in: "query", schema: { type: "string" } },
          {
            name: "tab",
            in: "query",
            schema: {
              type: "string",
              enum: ["all", "draft", "pending", "partially_paid", "paid", "cancelled", "deleted"],
            },
          },
          { name: "dateFrom", in: "query", schema: { type: "string", format: "date" } },
          { name: "dateTo", in: "query", schema: { type: "string", format: "date" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
        ],
        responses: { "200": { description: "Paginated list of invoices" } },
        "x-permission": "sales_invoices.view",
      },
      post: {
        summary: "Create an invoice",
        description: "Created as a draft unless `finalize: true` is passed, matching the dashboard's Save flow.",
        responses: { "201": { description: "Created" }, "400": { description: "Validation error" } },
        "x-permission": "sales_invoices.create",
      },
    },
    "/invoices/{id}": {
      get: {
        summary: "Get an invoice",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Invoice" }, "404": { description: "Not found" } },
        "x-permission": "sales_invoices.view",
      },
    },
    "/payments": {
      get: {
        summary: "List the Payments Timeline",
        responses: { "200": { description: "Paginated list of payments" } },
        "x-permission": "payments.view",
      },
      post: {
        summary: "Record payment(s) against a finalized invoice",
        responses: { "201": { description: "Created" }, "400": { description: "Validation error" } },
        "x-permission": "payments.create",
      },
    },
    "/customers": {
      get: { summary: "List customers", responses: { "200": { description: "Paginated list" } }, "x-permission": "customers.view" },
      post: { summary: "Create a customer", responses: { "201": { description: "Created" } }, "x-permission": "customers.create" },
    },
    "/customers/{id}": {
      get: {
        summary: "Get a customer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Customer" }, "404": { description: "Not found" } },
        "x-permission": "customers.view",
      },
      patch: {
        summary: "Update a customer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        "x-permission": "customers.edit",
      },
    },
    "/vendors": {
      get: { summary: "List vendors", responses: { "200": { description: "Paginated list" } }, "x-permission": "vendors.view" },
      post: { summary: "Create a vendor", responses: { "201": { description: "Created" } }, "x-permission": "vendors.create" },
    },
    "/vendors/{id}": {
      get: {
        summary: "Get a vendor",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Vendor" }, "404": { description: "Not found" } },
        "x-permission": "vendors.view",
      },
      patch: {
        summary: "Update a vendor",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        "x-permission": "vendors.edit",
      },
    },
    "/products": {
      get: { summary: "List products", responses: { "200": { description: "Paginated list" } }, "x-permission": "products.view" },
      post: { summary: "Create a product", responses: { "201": { description: "Created" } }, "x-permission": "products.create" },
    },
    "/products/{id}": {
      get: {
        summary: "Get a product",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Product" }, "404": { description: "Not found" } },
        "x-permission": "products.view",
      },
      patch: {
        summary: "Update a product",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        "x-permission": "products.edit",
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(openApiDocument);
}
