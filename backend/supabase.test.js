import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseClient } from "./supabase.js";

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {}
};

function createResponse({ status = 200, json: jsonValue = null, text: textValue = "", headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return jsonValue;
    },
    async text() {
      if (textValue !== "") return textValue;
      if (jsonValue !== null && jsonValue !== undefined) return JSON.stringify(jsonValue);
      return "";
    },
    headers: {
      get(name) {
        const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase());
        return key ? headers[key] : undefined;
      }
    }
  };
}

test("ensureVisitorRecord insere novo visitante quando ainda nao existe", async () => {
  const requests = [];
  const fetchMock = async (url, options = {}) => {
    const entry = {
      url: typeof url === "string" ? url : url.toString(),
      method: options.method || "GET",
      body: options.body || null,
      headers: options.headers || {}
    };
    requests.push(entry);
    if (requests.length === 1) {
      return createResponse({ json: [] });
    }
    if (requests.length === 2) {
      return createResponse({ status: 201 });
    }
    throw new Error("fetch inesperado");
  };

  const client = createSupabaseClient({
    url: "https://example.supabase.co",
    key: "test-key",
    visitorsTable: "contador",
    fetch: fetchMock,
    logger: noopLogger
  });

  await client.ensureVisitorRecord("(11) 98888-7777");

  assert.equal(requests.length, 2, "espera 2 chamadas ao fetch");
  const [checkRequest, insertRequest] = requests;
  assert.match(checkRequest.url, /rest\/v1\/contador/);
  assert.equal(checkRequest.method, "GET");
  assert.match(checkRequest.url, /numero=eq\.11988887777/);

  assert.equal(insertRequest.method, "POST");
  assert.match(insertRequest.url, /rest\/v1\/contador\?on_conflict=numero$/);
  const body = JSON.parse(insertRequest.body);
  assert.equal(body[0].numero, "11988887777");
  assert.equal(body[0].visit_count, 1);
  assert.ok(Date.parse(body[0].last_visit), "last_visit deve ser ISO valido");
});

test("ensureVisitorRecord atualiza contador quando visitante ja existe", async () => {
  const requests = [];
  const fetchMock = async (url, options = {}) => {
    const entry = {
      url: typeof url === "string" ? url : url.toString(),
      method: options.method || "GET",
      body: options.body || null,
      headers: options.headers || {}
    };
    requests.push(entry);
    if (requests.length === 1) {
      return createResponse({ json: [{ id: 42, numero: "1199998888", visit_count: 5 }] });
    }
    if (requests.length === 2) {
      return createResponse({ status: 204 });
    }
    throw new Error("fetch inesperado");
  };

  const client = createSupabaseClient({
    url: "https://example.supabase.co",
    key: "test-key",
    visitorsTable: "contador",
    fetch: fetchMock,
    logger: noopLogger
  });

  await client.ensureVisitorRecord("1199998888");

  assert.equal(requests.length, 2);
  const [, updateRequest] = requests;
  assert.equal(updateRequest.method, "PATCH");
  assert.match(updateRequest.url, /numero=eq\.1199998888/);
  const body = JSON.parse(updateRequest.body);
  assert.equal(body.visit_count, 6);
  assert.ok(Date.parse(body.last_visit));
});
