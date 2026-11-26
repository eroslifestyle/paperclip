#!/usr/bin/env python3
"""Etichetta con cliente: i ticket Paperclip bloccati o in revisione (senza IA).

Ordine: 1) label cliente: di un antenato (max 6 livelli) 2) regola regex su titolo
e primi 600 caratteri della descrizione 3) altrimenti lascia e segnala.
Usa solo stdlib. Esegui con: python3 -I etichetta-cliente.py [--dry-run]
"""
import argparse
import json
import re
import sys
import urllib.request

API_BASE = "http://127.0.0.1:3100/api"
COMPANY_ID = "8c8b98d0-d9ad-4ef5-a1c6-76d389a431ed"
STATUSES = ["blocked", "in_review"]
LABEL_PREFIX = "cliente:"
MAX_ANCESTOR_LEVELS = 6
DESCRIPTION_CHARS = 600
TIMEOUT_S = 15
TITLE_CUT = 70

RULES = [
    ("nipec", r"\b(?:NIPEC|PLUTO|Uarda|Petrus)\b"),
    ("keyok", r"\b(?:KeyOk|keyok)\b"),
    ("chacochips", r"\b(?:Chaco)\b"),
    ("giadabeauty", r"\b(?:Giada)\b"),
    ("dreamnailsgaia", r"\b(?:DreamNails|Gaia)\b"),
    ("phd", r"\b(?:Paddle|PHD)\b"),
    ("pragmakreative", r"\b(?:PragmaKreative|PK|Token|Prezzi|ElevenLabs|Pinterest|Threads|Meta ads|posta|approvazioni|[Rr]egola 105|Sito)\b"),
]
TITLE_ONLY_KEYS = {"pragmakreative"}


def api_get(path):
    req = urllib.request.Request(API_BASE + path, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_patch(path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_BASE + path, data=body, method="PATCH",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_client_labels():
    """Ritorna {nome_label: id} solo per le label cliente: della company."""
    labels = api_get(f"/companies/{COMPANY_ID}/labels")
    return {l["name"]: l["id"] for l in labels if l.get("name", "").startswith(LABEL_PREFIX)}


def load_open_issues():
    """Issue in stato bloccato/revisione, deduplicate per id."""
    seen, issues = set(), []
    for status in STATUSES:
        data = api_get(f"/companies/{COMPANY_ID}/issues?status={status}&limit=500")
        items = data if isinstance(data, list) else data.get("issues", [])
        for issue in items:
            if issue["id"] not in seen:
                seen.add(issue["id"])
                issues.append(issue)
    return issues


def client_label_name(issue):
    """Nome della label cliente: già presente sull'issue, altrimenti None."""
    for label in issue.get("labels") or []:
        if label.get("name", "").startswith(LABEL_PREFIX):
            return label["name"]
    return None


def fetch_issue_cached(issue_id, cache):
    """Issue per id: dalla cache di run se presente, altrimenti una sola GET."""
    if issue_id not in cache:
        cache[issue_id] = api_get(f"/issues/{issue_id}")
    return cache[issue_id]


def label_from_ancestors(issue, cache):
    """Risale la catena parentId (max 6 livelli) e ritorna la label cliente trovata."""
    parent_id = issue.get("parentId")
    for _ in range(MAX_ANCESTOR_LEVELS):
        if not parent_id:
            return None
        parent = fetch_issue_cached(parent_id, cache)
        name = client_label_name(parent)
        if name:
            return name
        parent_id = parent.get("parentId")
    return None


def label_from_rules(issue):
    """Prima regola che matcha titolo + primi 600 caratteri di descrizione.
    Le regole in TITLE_ONLY_KEYS matchano solo sul titolo."""
    title = issue.get("title") or ""
    text = title + " " + (issue.get("description") or "")[:DESCRIPTION_CHARS]
    for key, pattern in RULES:
        subject = title if key in TITLE_ONLY_KEYS else text
        if re.search(pattern, subject):
            return LABEL_PREFIX + key
    return None


def resolve_label(issue, client_labels, cache):
    """Ritorna (nome_label, origine). origine 'errore' = antenati non letti: niente regole.
    (None, None) se nessuna label valida. Salta label inesistenti."""
    try:
        name, origin = label_from_ancestors(issue, cache), "parent"
    except (OSError, ValueError) as exc:
        print(f"ERRORE antenati {issue.get('identifier')}: {exc}", file=sys.stderr)
        return None, "errore"
    if name is None:
        name, origin = label_from_rules(issue), "regola"
    if name is None or name not in client_labels:
        return None, None
    return name, origin


def apply_label(issue, label_id, dry_run):
    """PATCH con labelIds esistenti + nuova (il PATCH sostituisce l'intero set)."""
    if dry_run:
        return
    current = list(issue["labelIds"])
    if label_id not in current:
        current.append(label_id)
    api_patch(f"/issues/{issue['id']}", {"labelIds": current})


def process_issue(issue, client_labels, dry_run, cache):
    """Ritorna 'etichettato', 'senza', 'gia' oppure 'errore'."""
    identifier = issue.get("identifier", "?")
    try:
        if client_label_name(issue):
            return "gia"
        label_name, origin = resolve_label(issue, client_labels, cache)
        if origin == "errore":
            return "errore"
        if label_name is None:
            title = (issue.get("title") or "")[:TITLE_CUT]
            print(f"senza cliente: {identifier} {title}")
            return "senza"
        if not isinstance(issue.get("labelIds"), list):
            print(f"salto {identifier}: labelIds assenti", file=sys.stderr)
            return "errore"
        apply_label(issue, client_labels[label_name], dry_run)
        suffix = " [dry-run]" if dry_run else ""
        print(f"{identifier} -> {label_name} ({origin}){suffix}")
        return "etichettato"
    except (OSError, ValueError) as exc:
        print(f"ERRORE {identifier}: {exc}", file=sys.stderr)
        return "errore"


def run(dry_run):
    """Ritorna il numero di errori contati nel run."""
    client_labels = load_client_labels()
    issues = load_open_issues()
    cache = {issue["id"]: issue for issue in issues}
    counts = {"etichettato": 0, "senza": 0, "errore": 0}
    for issue in issues:
        result = process_issue(issue, client_labels, dry_run, cache)
        if result in counts:
            counts[result] += 1
    print(
        f"etichettati {counts['etichettato']}, senza cliente {counts['senza']}, "
        f"errori {counts['errore']}"
    )
    return counts["errore"]


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Etichetta cliente sui ticket Paperclip")
    parser.add_argument("--dry-run", action="store_true", help="mostra le modifiche senza scrivere")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    try:
        errors = run(args.dry_run)
    except (OSError, ValueError) as exc:
        print(f"ERRORE API: {exc}", file=sys.stderr)
        return 1
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
