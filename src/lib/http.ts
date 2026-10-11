/** Streams JSON-compatible whitespace while long case generation or scoring runs. */
export function longJson<T>(fn: () => Promise<T>): Response {
  const enc = new TextEncoder();
  let stopped = false;
  let beat: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    stopped = true;
    if (beat) clearInterval(beat);
  };
  const stream = new ReadableStream({
    async start(controller) {
      const write = (text: string) => {
        if (!stopped) controller.enqueue(enc.encode(text));
      };
      write(" \n");
      beat = setInterval(() => write(" \n"), 8000);
      try {
        // A disconnected browser cancels delivery, not the server's persistence work.
        const result = await fn();
        write(JSON.stringify(result));
      } catch (e) {
        console.error(e);
        write(
          JSON.stringify({
            error: (e as Error).message || "Something went wrong",
          }),
        );
      } finally {
        if (!stopped) controller.close();
        stop();
      }
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
export const bad = (message: string, status = 400) =>
  Response.json({ error: message }, { status });
