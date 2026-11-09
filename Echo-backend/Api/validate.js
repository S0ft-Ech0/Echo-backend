const WHOP_API_BASE = "https://api.whop.com/api/v1";
const WHOP_API_VERSION = "2026-11-07";
const VALID_STATUSES = new Set(["active", "trialing", "completed"]);
const LICENSE_KEY_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("Body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ valid: false });
  }

  let licenseKey;
  try {
    ({ licenseKey } = await readBody(req));
  } catch {
    return res.status(400).json({ valid: false });
  }

  if (typeof licenseKey !== "string" || !LICENSE_KEY_PATTERN.test(licenseKey.trim())) {
    return res.status(400).json({ valid: false });
  }

  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) {
    console.error("WHOP_API_KEY is not set");
    return res.status(500).json({ valid: false });
  }

  try {
    const whopRes = await fetch(
      `${WHOP_API_BASE}/memberships/${encodeURIComponent(licenseKey.trim())}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Api-Version-Date": WHOP_API_VERSION,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!whopRes.ok) {
      if (whopRes.status !== 404) {
        console.error("Whop API error:", whopRes.status);
      }
      return res.status(200).json({ valid: false });
    }

    const membership = await whopRes.json();
    const valid = VALID_STATUSES.has(membership?.status);

    return res.status(200).json({ valid });
  } catch (error) {
    console.error("License validation failed:", error?.message);
    return res.status(502).json({ valid: false });
  }
};
