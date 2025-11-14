const noop = () => {};
const defaultLogger = {
  info: noop,
  warn: noop,
  error: noop,
  log: noop
};

let cachedNodeFetch = null;
let cachedNodeFetchPromise = null;

const loadNodeFetch = async () => {
  if (cachedNodeFetch) return cachedNodeFetch;
  if (!cachedNodeFetchPromise) {
    cachedNodeFetchPromise = import("node-fetch")
      .then((mod) => {
        cachedNodeFetch = mod?.default || mod;
        return cachedNodeFetch;
      })
      .catch((err) => {
        cachedNodeFetchPromise = null;
        throw err;
      });
  }
  return cachedNodeFetchPromise;
};

const parseContentRangeTotal = (header) => {
  if (!header || typeof header !== "string") return null;
  const parts = header.split("/");
  if (parts.length !== 2) return null;
  const total = Number(parts[1]);
  return Number.isFinite(total) ? total : null;
};

const normalizeDigits = (value) => String(value ?? "").replace(/\D/g, "");

export function createSupabaseClient(options = {}) {
  const {
    url,
    key,
    visitorsTable,
    productsTable,
    fetch: fetchImpl,
    logger: providedLogger
  } = options;

  const logger = {
    ...defaultLogger,
    ...(providedLogger || {})
  };

  const defaultFetch = async (...args) => {
    const nodeFetch = await loadNodeFetch();
    return nodeFetch(...args);
  };

  const fetchFn = typeof fetchImpl === "function"
    ? fetchImpl
    : typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : defaultFetch;

  const baseUrl = typeof url === "string" && url.trim()
    ? url.trim().replace(/\/$/, "")
    : null;
  const authKey = typeof key === "string" && key.trim() ? key.trim() : null;
  const visitorsPath = typeof visitorsTable === "string" && visitorsTable.trim()
    ? visitorsTable.trim()
    : null;
  const productsPath = typeof productsTable === "string" && productsTable.trim()
    ? productsTable.trim()
    : null;

  const hasAuth = Boolean(baseUrl && authKey && fetchFn);

  const buildCommonHeaders = () => ({
    "apikey": authKey,
    "Authorization": `Bearer ${authKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json"
  });

  async function ensureVisitorRecord(phone) {
    try {
      if (!hasAuth || !visitorsPath) return;
      const digits = normalizeDigits(phone);
      if (!digits) return;

      const tablePath = encodeURIComponent(visitorsPath);
      const commonHeaders = buildCommonHeaders();

      let existing = null;

      try {
        const checkUrl = new URL(`${baseUrl}/rest/v1/${tablePath}`);
        checkUrl.searchParams.set("select", "id,numero,visit_count");
        checkUrl.searchParams.set("numero", `eq.${digits}`);
        checkUrl.searchParams.set("limit", "1");
        const checkRes = await fetchFn(checkUrl, { headers: commonHeaders });
        if (checkRes.ok) {
          const arr = await checkRes.json().catch(() => null);
          if (Array.isArray(arr) && arr.length) {
            existing = arr[0];
          }
        } else {
          logger.warn?.("[visitors] Supabase check falhou", { status: checkRes.status });
        }
      } catch (err) {
        logger.warn?.("[visitors] Supabase check erro", err?.message || err);
      }

      const nowIso = new Date().toISOString();

      if (existing) {
        try {
          const nextCount = Number(existing?.visit_count || 0) + 1;
          const updateUrl = new URL(`${baseUrl}/rest/v1/${tablePath}`);
          updateUrl.searchParams.set("numero", `eq.${digits}`);
          const updateHeaders = {
            ...commonHeaders,
            "Prefer": "return=minimal"
          };
          const updateRes = await fetchFn(updateUrl, {
            method: "PATCH",
            headers: updateHeaders,
            body: JSON.stringify({
              visit_count: nextCount,
              last_visit: nowIso
            })
          });
          if (!updateRes.ok) {
            const text = await updateRes.text().catch(() => "");
            logger.warn?.("[visitors] Supabase update falhou", updateRes.status, text);
          }
        } catch (err) {
          logger.warn?.("[visitors] Supabase update erro", err?.message || err);
        }
        return;
      }

      try {
        const payload = [{
          numero: digits,
          visit_count: 1,
          last_visit: nowIso
        }];
        const insertUrl = `${baseUrl}/rest/v1/${tablePath}?on_conflict=numero`;
        const insertHeaders = {
          ...commonHeaders,
          "Prefer": "resolution=merge-duplicates,return=minimal"
        };
        const insertRes = await fetchFn(insertUrl, {
          method: "POST",
          headers: insertHeaders,
          body: JSON.stringify(payload)
        });
        if (!insertRes.ok) {
          const text = await insertRes.text().catch(() => "");
          logger.warn?.("[visitors] Supabase insert falhou", insertRes.status, text);
        }
      } catch (err) {
        logger.warn?.("[visitors] Supabase insert erro", err?.message || err);
      }
    } catch (err) {
      logger.warn?.("[visitors] Registro erro", err?.message || err);
    }
  }

  async function fetchVisitorSummary() {
    if (!hasAuth || !visitorsPath) return null;

    const tablePath = encodeURIComponent(visitorsPath);
    const commonHeaders = buildCommonHeaders();

    let totalVisitors = null;
    let totalVisits = null;
    let recentVisitors = [];

    try {
      const statsUrl = new URL(`${baseUrl}/rest/v1/${tablePath}`);
      statsUrl.searchParams.set("select", "visit_count");
      statsUrl.searchParams.set("limit", "10000");

      const statsRes = await fetchFn(statsUrl, {
        headers: {
          ...commonHeaders,
          "Prefer": "count=exact"
        }
      });

      if (statsRes.ok) {
        const statsRows = await statsRes.json().catch(() => []);
        if (Array.isArray(statsRows) && statsRows.length) {
          totalVisits = statsRows.reduce((sum, row) => {
            const val = Number(row?.visit_count ?? 0);
            return Number.isFinite(val) ? sum + val : sum;
          }, 0);
        } else {
          totalVisits = 0;
        }
        totalVisitors = parseContentRangeTotal(statsRes.headers.get("content-range"));
        if (totalVisitors == null) {
          totalVisitors = Array.isArray(statsRows) ? statsRows.length : 0;
        }
      } else {
        const text = await statsRes.text().catch(() => "");
        logger.warn?.("[visitors] Supabase stats falhou", statsRes.status, text);
      }
    } catch (err) {
      logger.warn?.("[visitors] Supabase stats erro", err?.message || err);
    }

    try {
      const listUrl = new URL(`${baseUrl}/rest/v1/${tablePath}`);
      listUrl.searchParams.set("select", "numero,visit_count,last_visit,first_visit");
      listUrl.searchParams.set("order", "last_visit.desc");
      listUrl.searchParams.set("limit", "20");

      const listRes = await fetchFn(listUrl, { headers: commonHeaders });
      if (listRes.ok) {
        const listRows = await listRes.json().catch(() => []);
        if (Array.isArray(listRows)) {
          recentVisitors = listRows.map((row) => ({
            numero: row?.numero || null,
            visitCount: Number(row?.visit_count ?? 0) || 0,
            lastVisit: row?.last_visit || null,
            firstVisit: row?.first_visit || null
          }));
        }
      } else {
        const text = await listRes.text().catch(() => "");
        logger.warn?.("[visitors] Supabase lista falhou", listRes.status, text);
      }
    } catch (err) {
      logger.warn?.("[visitors] Supabase lista erro", err?.message || err);
    }

    if (totalVisitors == null && totalVisits == null && recentVisitors.length === 0) {
      return null;
    }

    return {
      totalVisitors: totalVisitors ?? 0,
      totalVisits: totalVisits ?? 0,
      recentVisitors
    };
  }

  async function upsertProduct(p) {
    try {
      if (!hasAuth || !productsPath) return;
      const row = {
        id: p.id,
        name: p.name,
        category: p.category || null,
        price: typeof p.price === "number" ? Number(p.price) : null,
        oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
        priceTwo: p.priceTwo != null ? Number(p.priceTwo) : null,
        image: p.image || null,
        createdAt: p.createdAt || null
      };
      const res = await fetchFn(`${baseUrl}/rest/v1/${encodeURIComponent(productsPath)}?on_conflict=id`, {
        method: "POST",
        headers: {
          ...buildCommonHeaders(),
          "Prefer": "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify([row])
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.warn?.("Supabase upsert falhou:", res.status, text);
      }
    } catch (e) {
      logger.warn?.("Supabase upsert erro:", e?.message || e);
    }
  }

  async function deleteProduct(id) {
    try {
      if (!hasAuth || !productsPath) return;
      const res = await fetchFn(`${baseUrl}/rest/v1/${encodeURIComponent(productsPath)}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: buildCommonHeaders()
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.warn?.("Supabase delete falhou:", res.status, text);
      }
    } catch (e) {
      logger.warn?.("Supabase delete erro:", e?.message || e);
    }
  }

  return {
    ensureVisitorRecord,
    fetchVisitorSummary,
    upsertProduct,
    deleteProduct,
    _internals: {
      parseContentRangeTotal,
      normalizeDigits
    }
  };
}

export { parseContentRangeTotal };
