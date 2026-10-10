export type LlmClient = {
  complete(prompt: string): Promise<string>;
};

export function createOpenAiClient(): LlmClient | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const base = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return {
    async complete(prompt: string) {
      const url = new URL(base.endsWith("/") ? `${base}chat/completions` : `${base}/chat/completions`);
      if (url.protocol !== "https:") {
        throw new Error("The model endpoint must use HTTPS.");
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You return JSON only. You never invent timestamps, lesson IDs, or video IDs. You do not certify trainers.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Model request failed (${response.status}).`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("The model returned an empty response.");
      return content;
    },
  };
}
