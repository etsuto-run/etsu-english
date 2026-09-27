// Netlify serverless function: receives a prompt from the browser, calls the Anthropic API
// server-side (the API key lives only here, in an environment variable — never in the browser),
// and returns the parsed JSON object the app's prompts already ask the model to produce.
//
// The browser calls this at /.netlify/functions/ask with POST { prompt: "..." }.

const MODEL = "claude-haiku-4-5-20251001"; // cheapest current model; swap to claude-sonnet-4-6 if you want higher quality

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body || "{}");
    prompt = body.prompt;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }
  if (!prompt || typeof prompt !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing 'prompt' string" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on the server" }) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { statusCode: res.status, body: JSON.stringify({ error: "Anthropic API error", detail: errText }) };
    }

    const data = await res.json();
    const rawText = (data.content || [])
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("")
      .trim();

    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: "Model did not return valid JSON", raw: rawText }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Request to Anthropic failed", detail: String(e) }) };
  }
};
