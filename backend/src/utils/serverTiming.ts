// Server-Timing marks so production latency is attributable from `curl -D -`
// (this service's logs are not reachable from the local Render CLI).
export function makeTiming(res: any) {
  const t0 = Date.now();
  let mark = t0;
  const laps: string[] = [];
  return {
    lap(name: string) { const now = Date.now(); laps.push(`${name};dur=${now - mark}`); mark = now; },
    send() { res.setHeader('Server-Timing', [...laps, `total;dur=${Date.now() - t0}`].join(', ')); },
  };
}
