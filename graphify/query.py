#!/usr/bin/env python3
"""Query the graphify graph: python3 graphify/query.py <subcommand> [arg]

  concepts                 list concept nodes and their size
  concept <name>           every file implementing a concept, with line numbers
  file <path>              edges in and out of a file
  who <symbol>             who defines / calls a symbol
  path <from> <to>         shortest import/call path between two files
  hot                      most-referenced files (in-degree) + symbol counts
  tables                   files touching each SQL table
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict, deque
from pathlib import Path

G = json.loads((Path(__file__).parent / "graph.json").read_text())
NODES = {n["id"]: n for n in G["nodes"]}
OUT = defaultdict(list)
IN = defaultdict(list)
for e in G["edges"]:
    OUT[e["from"]].append(e)
    IN[e["to"]].append(e)


def show(nid: str) -> str:
    n = NODES[nid]
    loc = f" ({n['path']}:{n['line']})" if "line" in n else (f" ({n['path']})" if "path" in n else "")
    return f"[{n['kind']}] {n['label']}{loc}"


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    cmd, *rest = argv
    if cmd == "concepts":
        c = defaultdict(int)
        for e in G["edges"]:
            if e["kind"] == "implements":
                c[NODES[e["to"]]["label"]] += 1
        for name, n in sorted(c.items(), key=lambda kv: -kv[1]):
            print(f"{n:4d}  {name}")
    elif cmd == "concept":
        want = rest[0].lower()
        for e in G["edges"]:
            if e["kind"] == "implements" and want in NODES[e["to"]]["label"]:
                print(" ", show(e["from"]))
    elif cmd == "file":
        want = rest[0]
        for e in IN.get(next(n["id"] for n in G["nodes"] if n.get("path") == want), ""):
            if e["kind"] != "contains":
                print("  <-", e["kind"], show(e["from"]))
        nid = next((n["id"] for n in G["nodes"] if n.get("path") == want), None)
        if nid:
            for e in OUT[nid]:
                if e["kind"] != "contains":
                    print("  ->", e["kind"], show(e["to"]))
    elif cmd == "who":
        want = rest[0]
        for n in G["nodes"]:
            if n["label"] == want and n["kind"] == "symbol":
                print("DEF", show(n["id"]), f"line {n.get('line')}")
                for e in IN.get(n["id"], []):
                    print("   called from", show(e["from"]))
    elif cmd == "path":
        src = next(n["id"] for n in G["nodes"] if n.get("path") == rest[0])
        dst = next(n["id"] for n in G["nodes"] if n.get("path") == rest[1])
        prev = {src: None}
        q = deque([src])
        while q:
            cur = q.popleft()
            if cur == dst:
                break
            for e in OUT[cur]:
                if e["kind"] in {"imports", "calls_into", "defined_in", "defines"} and e["to"] not in prev:
                    prev[e["to"]] = cur
                    q.append(e["to"])
        if dst not in prev:
            print("no path")
            return 0
        chain = []
        cur = dst
        while cur:
            chain.append(cur)
            cur = prev[cur]
        for nid in reversed(chain):
            print(" ", show(nid))
    elif cmd == "hot":
        for nid, edges in sorted(IN.items(), key=lambda kv: -len(kv[1]))[:40]:
            n = NODES[nid]
            if n["kind"] in {"file", "sym", "test"}:
                syms = sum(1 for e in OUT[nid] if e["kind"] == "defines")
                print(f"{len(edges):4d} in  {syms:3d} sym  {show(nid)}")
    elif cmd == "tables":
        for e in G["edges"]:
            if e["kind"] == "touches_table":
                print(f"{NODES[e['to']]['label']:28s} {NODES[e['from']].get('path')}")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
