#!/usr/bin/env python3
"""
graphify - static knowledge-graph extractor for the JobHunter repo.

Builds a file/symbol/import/route/concept graph and renders it as
  graphify/graph.json     machine-readable graph (query with query.py)
  graphify/GRAPH.md       mermaid + tables for humans
  graphify/CONCEPTS.md    where every domain concept is implemented

Deterministic, no dependencies beyond the stdlib.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graphify"

SKIP_DIRS = {
    ".git", "node_modules", "venv", "__pycache__", "dist", "build",
    ".vite", "graphify", "uploads", ".cache",
}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sql"}
DOC_EXT = {".md"}

# domain concepts -> regex proving they live in a file
CONCEPTS: dict[str, str] = {
    "ats_readiness": r"readiness|ats",
    "ats_banding": r"band|tier|grade",
    "keyword_matching": r"keyword|lexical|exact[_ ]?match|token",
    "semantic_embedding": r"embedding|semantic|cosine",
    "jd_parsing": r"jd[_ ]?parser|pareJd|parse_jd|jdText",
    "jd_rubric": r"rubric",
    "evidence_selection": r"evidence",
    "skill_extraction": r"skillExtractor|extractSkills|skill_extract",
    "skill_normalisation": r"normaliz",
    "seniority_scoring": r"seniority",
    "job_recommendation": r"recommend",
    "job_ranking": r"ranking|rankS|rank\(",
    "eligibility_filter": r"eligib",
    "geography_filter": r"geograph|country|remote",
    "job_freshness": r"freshness|postedAt|ageDays",
    "retrieval_providers": r"Provider\b",
    "embedding_cache": r"embedding_cache|embeddingCache",
    "score_aggregation": r"weight|score",
    "auth_session": r"session|jwt|cookie",
    "otp_email": r"otp|nodemailer",
    "storage": r"supabaseStorage|Storage|bucket",
    "pdf_parsing": r"pdf-?parse|pdfParser|pdfjs",
}

SYMBOL_RE = [
    re.compile(r"^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)"),
    re.compile(r"^(?:async\s+)?function\s+(\w+)"),
    re.compile(r"^export\s+(?:abstract\s+)?class\s+(\w+)"),
    re.compile(r"^class\s+(\w+)"),
    re.compile(r"^export\s+(?:const|let|var)\s+(\w+)"),
    re.compile(r"^def\s+(\w+)"),
    re.compile(r"^class\s+(\w+)\s*[:\(]"),
    re.compile(r"^(\w+)\s*=\s*(?:async\s*)?(?:\(|lambda)"),
]
IMPORT_RE = re.compile(r"""(?:from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\))""")
PY_IMPORT_RE = re.compile(r"^\s*(?:from\s+([\w\.]+)\s+import|import\s+([\w\.]+))")
ROUTE_RE = re.compile(r"""\b(?:app|router)\.(get|post|put|patch|delete|all|use)\(\s*['"]([^'"]+)['"]""")
SQL_TABLE_RE = re.compile(r"(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|INSERT\s+INTO|UPDATE|FROM|JOIN)\s+(?:public\.)?([a-z_][a-z0-9_]*)", re.I)
CALL_RE = re.compile(r"\b(\w{3,})\s*\(")


def node_id(kind: str, name: str) -> str:
    h = hashlib.sha1(f"{kind}:{name}".encode()).hexdigest()[:10]
    return f"{kind}:{name}#{h}"


def walk():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            p = Path(dirpath) / fn
            ext = p.suffix.lower()
            if ext in CODE_EXT or ext in DOC_EXT:
                yield p


def module_key(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def resolve_import(spec: str, from_file: Path, by_path: dict[str, Path]) -> str | None:
    spec = spec.split("?")[0]
    if spec.startswith("@/"):
        spec = spec[2:]
        base = ROOT / "frontend" / "project" / "src" / spec
    elif spec.startswith("."):
        base = (from_file.parent / spec)
    else:
        return None
    base = base.resolve()
    cands = []
    for suffix in ("", ".ts", ".tsx", ".js", ".jsx", ".py", "/index.ts", "/index.tsx"):
        cands.append(str(base) + suffix)
    for c in cands:
        try:
            rel = Path(c).relative_to(ROOT).as_posix()
        except ValueError:
            continue
        if rel in by_path:
            return rel
    return None


def build() -> dict:
    files = sorted(walk())
    by_path = {module_key(p): p for p in files}
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    symbols_by_file: dict[str, list[str]] = defaultdict(list)
    exported_names: dict[str, dict[str, str]] = defaultdict(dict)  # name -> module -> sym node

    def add_node(nid, kind, label, **extra):
        if nid not in nodes:
            nodes[nid] = {"id": nid, "kind": kind, "label": label, **extra}
        return nid

    file_nodes: dict[str, str] = {}
    for rel, path in by_path.items():
        is_doc = path.suffix.lower() in DOC_EXT
        is_test = "/tests/" in f"/{rel}" or rel.startswith("e2e/") or path.name.startswith("test_")
        kind = "doc" if is_doc else ("test" if is_test else "file")
        fn = add_node(node_id("file", rel), kind, rel,
                      path=rel,
                      lang=path.suffix.lstrip("."),
                      loc=len(path.read_text(errors="ignore").splitlines()))
        file_nodes[rel] = fn

    for rel, path in by_path.items():
        text = path.read_text(errors="ignore")
        lines = text.splitlines()
        src = file_nodes[rel]
        open_sym: list[tuple[str, int, str]] = []  # (name, indent, node)

        for i, line in enumerate(lines, 1):
            stripped = line.rstrip()
            if not stripped.strip():
                continue
            indent = len(line) - len(line.lstrip())
            # symbols
            name = None
            for rx in SYMBOL_RE:
                m = rx.match(stripped.strip() if rx.pattern.startswith("^export") is False else stripped.lstrip())
                if m:
                    name = m.group(1)
                    break
            if name and len(name) > 1 and name not in {"default", "constructor"}:
                while open_sym and open_sym[-1][1] >= indent:
                    open_sym.pop()
                sid = add_node(node_id("sym", f"{rel}::{name}"), "symbol", name,
                               path=rel, line=i, owner=rel)
                edges.append({"from": src, "to": sid, "kind": "defines"})
                edges.append({"from": sid, "to": src, "kind": "defined_in"})
                symbols_by_file[rel].append(name)
                parent = open_sym[-1][2] if open_sym else src
                edges.append({"from": parent, "to": sid, "kind": "contains"})
                open_sym.append((name, indent, sid))
                exported_names[name][rel] = sid
            # imports
            if path.suffix == ".py":
                m = PY_IMPORT_RE.match(stripped)
                if m:
                    spec = m.group(1) or m.group(2) or ""
                    local = spec.split(".")[0]
                    tgt = None
                    for cand, cpath in by_path.items():
                        if cpath.stem == local and cpath.suffix == ".py":
                            tgt = cand
                            break
                    if tgt and tgt != rel:
                        edges.append({"from": src, "to": file_nodes[tgt], "kind": "imports"})
            else:
                for m in IMPORT_RE.finditer(stripped):
                    spec = next(g for g in m.groups() if g)
                    tgt = resolve_import(spec, path, by_path)
                    if tgt and tgt != rel:
                        edges.append({"from": src, "to": file_nodes[tgt], "kind": "imports"})
                    else:
                        add_node(node_id("pkg", spec), "package", spec)
                        edges.append({"from": src, "to": node_id("pkg", spec), "kind": "imports_pkg"})
            # routes
            for m in ROUTE_RE.finditer(stripped):
                verb, route = m.group(1).upper(), m.group(2)
                rid = add_node(node_id("route", f"{verb} {route}"), "route", f"{verb} {route}",
                               path=rel, line=i, verb=verb, route=route)
                edges.append({"from": src, "to": rid, "kind": "exposes"})
            # sql tables
            for m in SQL_TABLE_RE.finditer(stripped):
                t = m.group(1).lower()
                if t in {"select", "set", "values", "where", "if", "table", "exists", "index", "on", "and", "or", "as"}:
                    continue
                tid = add_node(node_id("table", t), "table", t)
                edges.append({"from": src, "to": tid, "kind": "touches_table"})
        # concepts
        low = text.lower()
        for concept, rx in CONCEPTS.items():
            if re.search(rx, low):
                cid = add_node(node_id("concept", concept), "concept", concept)
                edges.append({"from": src, "to": cid, "kind": "implements"})

        # call edges by symbol (crude, name-resolution against repo exports)
        for i, line in enumerate(lines, 1):
            for m in CALL_RE.finditer(line):
                callee = m.group(1)
                if callee in {"if", "for", "while", "switch", "catch", "return", "function", "await", "new"}:
                    continue
                for owner, sid in exported_names.get(callee, {}).items():
                    if owner != rel:
                        edges.append({"from": src, "to": sid, "kind": "calls_into"})

    # concept index + collapse duplicates
    seen = set()
    uniq = []
    for e in edges:
        k = (e["from"], e["to"], e["kind"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(e)

    return {"nodes": list(nodes.values()), "edges": uniq, "root": str(ROOT)}


def render(g: dict) -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / "graph.json").write_text(json.dumps(g, indent=1))
    by_from = defaultdict(list)
    for e in g["edges"]:
        by_from[e["from"]].append(e)
    label = {n["id"]: n["label"] for n in g["nodes"]}

    concepts = [n for n in g["nodes"] if n["kind"] == "concept"]
    lines = ["# JobHunter knowledge graph", "",
             f"{len(g['nodes'])} nodes / {len(g['edges'])} edges. "
             "Generated by `graphify/graphify.py`; query it with `python3 graphify/query.py`."]
    lines += ["", "## Concept → implementation map", ""]
    for c in sorted(concepts, key=lambda n: n["label"]):
        users = [e["from"] for e in by_from[c["id"]]]
        lines += [f"### {c['label']}", ""]
        for u in sorted(users):
            src_file = next((n for n in g["nodes"] if n["id"] == u), None)
            if not src_file:
                continue
            lines.append(f"- `{label[u]}` ({src_file['kind']}, {src_file.get('loc', 0)} loc)"
                         + (f" line {src_file['line']}" if "line" in src_file else ""))
        lines.append("")
    (OUT / "GRAPH.md").write_text("\n".join(lines))

    # mermaid per layer
    layers = defaultdict(list)
    for n in g["nodes"]:
        if n["kind"] != "file":
            continue
        p = n["path"]
        if p.startswith("backend/src/modules/"):
            layers[p.split("/")[3]].append(n)
        elif p.startswith("backend/src/providers/"):
            layers["providers-" + p.split("/")[3].split(".")[0]].append(n)
        elif p.startswith("backend/src/services/"):
            layers["services"].append(n)
        elif p.startswith("backend/src/routes/"):
            layers["routes"].append(n)
        elif p.startswith("backend/src/controllers/"):
            layers["controllers"].append(n)
        elif p.startswith("frontend/"):
            layers["frontend"].append(n)
        elif p.startswith("backend/migrations"):
            layers["db"].append(n)

    mx = ["```mermaid", "graph LR"]
    ids = {}
    for i, n in enumerate(g["nodes"]):
        if n["kind"] not in {"file", "test"}:
            continue
        alias = f"n{i}"
        ids[n["id"]] = alias
        shape = f'[["{n["label"]}"]]' if n["kind"] == "test" else f'["{n["label"]}"]'
        mx.append(f"  {alias}{shape}")
    for e in g["edges"]:
        if e["kind"] in {"imports", "calls_into", "imports_pkg"} and e["from"] in ids and e["to"] in ids:
            arrow = "-->" if e["kind"] != "imports_pkg" else "-.->"
            mx.append(f"  {ids[e['from']]} {arrow} {ids[e['to']]}")
    mx.append("```")
    (OUT / "graph.mmd").write_text("\n".join(mx))


def main() -> int:
    g = build()
    render(g)
    counts = defaultdict(int)
    for n in g["nodes"]:
        counts[n["kind"]] += 1
    ec = defaultdict(int)
    for e in g["edges"]:
        ec[e["kind"]] += 1
    print("nodes:", dict(counts))
    print("edges:", dict(ec))
    print(f"wrote {OUT/'graph.json'}, {OUT/'GRAPH.md'}, {OUT/'CONCEPTS.md'}, {OUT/'graph.mmd'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
