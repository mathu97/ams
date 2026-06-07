"""Pretty-print an AMS session so you can see exactly what was captured.

    python examples/demos/view_session.py                # newest session in $AMS_LOCAL_DIR (or ./ams-data)
    python examples/demos/view_session.py path/to/session.json
"""

import json
import os
import sys
from glob import glob


def find_latest(root: str) -> str:
    files = sorted(glob(os.path.join(root, "sessions", "**", "*.json"), recursive=True))
    if not files:
        sys.exit(f"No sessions found under {root}/sessions. Run a demo first.")
    return files[-1]


def main():
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        root = os.environ.get("AMS_LOCAL_DIR", "./ams-data")
        path = find_latest(root)

    s = json.load(open(path))
    print(f"\nfile: {path}")
    print(f"session_id: {s['session_id']}   status: {s['status']}   duration: {s['duration_ms']}ms")
    print(f"agent: {s['agent'].get('name')}  env: {s.get('environment')}  tags: {s.get('tags')}")
    t = s["totals"]
    print(
        f"totals: {t['llm_calls']} llm · {t['tool_calls']} tools · {t['subagents']} subagents · "
        f"{t['errors']} errors · {t['usage']['input_tokens']}in/{t['usage']['output_tokens']}out tok · "
        f"${t.get('cost_usd')}"
    )
    print("\ntimeline:")
    for e in s["events"]:
        indent = "    " if e.get("parent_id") else ""
        dur = f"{e.get('duration_ms')}ms" if e.get("duration_ms") is not None else ""
        print(f"{indent}#{e['seq']:>2} {e['type']:<13} {e['name']:<26} {dur:>8}  {e['status']}")
        if e["type"] == "subagent":
            why = (e["subagent"].get("invocation_prompt") or "")[:100]
            print(f"{indent}     why spawned: {why!r}")
        elif e["type"] == "tool_call":
            tin = e["tool"].get("input")
            keys = list(tin.keys()) if isinstance(tin, dict) else tin
            print(f"{indent}     input: {keys}")
        elif e["type"] == "llm_message":
            if e["llm"].get("thinking"):
                print(f"{indent}     thinking: {e['llm']['thinking'][:100]!r}")
            if e["llm"].get("text"):
                print(f"{indent}     text: {e['llm']['text'][:100]!r}")
        elif e["type"] == "user_prompt":
            print(f"{indent}     prompt: {(e.get('prompt') or '')[:100]!r}")
    print()


if __name__ == "__main__":
    main()
