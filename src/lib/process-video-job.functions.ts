import { createServerFn } from "@tanstack/react-start";

export const triggerProcessVideoJob = createServerFn({ method: "POST" }).handler(
  async () => {
    const url = `${process.env.SUPABASE_URL}/functions/v1/process-video-job`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep text
    }
    return { status: res.status, body };
  },
);
