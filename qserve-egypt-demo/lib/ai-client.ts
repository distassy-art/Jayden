export type AiResult = {
  reply: string;
  navigate?: string;
  cartOps?: { op: string; sku: string; qty: number }[];
  showCart?: boolean;
  shipId?: string;
  partner?: boolean;
  model?: string;
};

export async function postSalesmanAi(
  body: Record<string, unknown>,
  onDelta: (acc: string) => void,
): Promise<AiResult> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!res.body) {
    const data = (await res.json().catch(() => ({}))) as AiResult;
    if (data.reply) onDelta(data.reply);
    return data;
  }
  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("event-stream")) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let acc = "";
    let done: AiResult | null = null;
    while (true) {
      const { value, done: eof } = await reader.read();
      if (eof) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(json) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (typeof data.delta === "string" && data.delta) {
            acc += data.delta;
            onDelta(acc);
          }
          if (data.done) {
            done = data as AiResult;
            if (!done.reply) done.reply = acc;
          }
        }
      }
    }
    if (done) {
      if (!done.reply) done.reply = acc;
      return done;
    }
    return { reply: acc };
  }
  const raw = await res.text();
  const data = (JSON.parse(raw || "{}") as AiResult) || {};
  if (data.reply) onDelta(data.reply);
  return data;
}
