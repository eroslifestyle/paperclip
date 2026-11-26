#!/usr/bin/env python3
"""Patch idempotente 'blocchi-per-cliente' per il server Paperclip installato.

Uso: python3 -I blocchi-per-cliente.py [--check]
  --check: solo stato, nessuna scrittura.
Ogni patch: se NEW presente -> 'gia applicata'; altrimenti OLD deve comparire
esattamente una volta, altrimenti errore e uscita 1 senza scrivere nulla.
Prima della prima scrittura di un file viene creato <file>.bak-blocchi (solo se assente).
"""
import os
import shutil
import sys

PAPERCLIP_LINK = "~/.paperclip/cli/current/node_modules/@paperclipai/server"
INSTALL = os.path.realpath(os.path.expanduser(PAPERCLIP_LINK))
ISSUES_JS = os.path.join(INSTALL, "dist", "services", "issues.js")
INBOX_JS = os.path.join(INSTALL, "ui-dist", "assets", "Inbox-DLYtWEDR.js")
BACKUP_SUFFIX = ".bak-blocchi"

S1_OLD = r"""                owner: { type: "unknown", agentId: null, userId: null, label: null },
                action: {
                    label: "Inspect blocker chain",
                    detail: "Inspect the stalled blocker or review leaf and make the next owner/action explicit.",
                },
                sourceIssue: source,"""

S1_NEW = r"""                ...pkUnblockHint(row, issuesById.get(blockerState.terminalBlockerIssueId) ?? row, companyAgents),
                sourceIssue: source,"""

S2_ANCHOR = r"""function parseIssueAssigneeAgentFilter(assigneeAgentId) {"""

S2_HELPER = r"""// pk-patch blocchi-per-cliente: show who/what unblocks a stalled chain, taken from the root blocker
function pkUnblockHint(row, rootIssue, companyAgents) {
    const descriptor = rootIssue.unblockDescriptor ?? row.unblockDescriptor ?? null;
    const descOwner = descriptor && typeof descriptor.owner === "object" && descriptor.owner ? descriptor.owner : null;
    const agentId = descOwner && "agentId" in descOwner ? descOwner.agentId : (descriptor ? null : rootIssue.assigneeAgentId ?? null);
    const userId = descOwner && "userId" in descOwner ? descOwner.userId : (descriptor ? null : rootIssue.assigneeUserId ?? null);
    const agentName = agentId ? (companyAgents.find((agent) => agent.id === agentId)?.name ?? null) : null;
    const owner = descriptor?.owner === "board"
        ? { type: "board", agentId: null, userId: null, label: "Board" }
        : agentId ? { type: "agent", agentId, userId: null, label: agentName }
            : userId ? { type: "user", agentId: null, userId, label: null }
                : { type: "unknown", agentId: null, userId: null, label: null };
    const prefix = rootIssue.id === row.id ? "" : `${rootIssue.identifier}: `;
    const ACTIVE = ["in_progress", "todo", "in_review"];
    const text = descriptor?.action
        ? descriptor.action
        : ACTIVE.includes(rootIssue.status) ? `in lavorazione (${rootIssue.status})`
            : rootIssue.status === "backlog" ? "in backlog, nessuno ci lavora"
                : "MANCA l'indicazione di sblocco";
    return {
        owner,
        action: { label: `${prefix}${text}`, detail: `${rootIssue.identifier} · ${rootIssue.title}` },
    };
}"""

S2_NEW = S2_HELPER + "\n" + S2_ANCHOR

U1_OLD = r"""var ho=[["blocker_type","Blocker type"],["none","None"]]"""
U1_NEW = r"""var ho=[["cliente","Cliente"],["owner","Chi sblocca"],["blocker_type","Blocker type"],["none","None"]]"""

U2_OLD = r"""function rl(t,u="urgency"){const h=new Map;"""
U2_NEW = r"""function rl(t,u="urgency",m="blocker_type"){if(m==="cliente"||m==="owner"){const g=new Map;for(const o of t){const k=m==="cliente"?((o.issue.labels??[]).map(l=>l?.name??"").find(n=>n.startsWith("cliente:"))?.slice(8).toUpperCase()??"SENZA CLIENTE"):(o.attention.owner?.label??(o.attention.owner?.type==="board"?"Board":"Da assegnare"));const v=g.get(k)??[];v.push(o),g.set(k,v)}return[...g.entries()].sort((a1,b1)=>b1[1].length-a1[1].length).map(([k,v])=>({variant:k,label:k,rows:fo(v,u)}))}const h=new Map;"""

U3_OLD = r"""Ze=(0,i.useMemo)(()=>rl(Fe,x),[Fe,x])"""
U3_NEW = r"""Ze=(0,i.useMemo)(()=>rl(Fe,x,y),[Fe,x,y])"""

U4_OLD = r"""(0,i.useState)("none"),[ne,Oe]=(0,i.useState)("most_recent")"""
U4_NEW = r"""(0,i.useState)("cliente"),[ne,Oe]=(0,i.useState)("most_recent")"""

U5_OLD = r"""(0,i.useState)("none"),[$e,Fe]=(0,i.useState)("most_recent")"""
U5_NEW = r"""(0,i.useState)("cliente"),[$e,Fe]=(0,i.useState)("most_recent")"""

U6_OLD = r"""children:[(0,e.jsx)("span",{className:"hidden w-(--sz-10_5rem) shrink-0 justify-start sm:inline-flex","data-testid":"blocked-row-reason-column"""
U6_NEW = r"""children:[t.attention.action?.label?(0,e.jsx)("span",{className:"text-muted-foreground",style:{display:"inline-block",maxWidth:"34rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},title:t.attention.action.detail?t.attention.action.label+" — "+t.attention.action.detail:t.attention.action.label,"data-testid":"blocked-row-unblock-hint",children:"Sblocca: "+t.attention.action.label}):null,(0,e.jsx)("span",{className:"hidden w-(--sz-10_5rem) shrink-0 justify-start sm:inline-flex","data-testid":"blocked-row-reason-column"""

PATCHES = [
    ("S1", ISSUES_JS, S1_OLD, S1_NEW),
    ("S2", ISSUES_JS, S2_ANCHOR, S2_NEW),
    ("U1", INBOX_JS, U1_OLD, U1_NEW),
    ("U2", INBOX_JS, U2_OLD, U2_NEW),
    ("U3", INBOX_JS, U3_OLD, U3_NEW),
    ("U4", INBOX_JS, U4_OLD, U4_NEW),
    ("U5", INBOX_JS, U5_OLD, U5_NEW),
    ("U6", INBOX_JS, U6_OLD, U6_NEW),
]


def main(argv):
    check_only = "--check" in argv[1:]
    unknown = [arg for arg in argv[1:] if arg != "--check"]
    if unknown:
        print(f"ERRORE: argomento sconosciuto: {unknown}")
        return 2

    print(f"INSTALL: {INSTALL}")
    original = {}
    current = {}
    pending = []

    try:
        for name, path, old, new in PATCHES:
            if path not in current:
                with open(path, encoding="utf-8", newline="") as handle:
                    current[path] = handle.read()
                original[path] = current[path]
            text = current[path]
            if new in text:
                print(f"gia applicata: {name}")
                continue
            count = text.count(old)
            if count != 1:
                print(f"ERRORE: {name}: OLD presente {count} volte in {path} (atteso 1). Nessuna scrittura.")
                return 1
            current[path] = text.replace(old, new, 1)
            pending.append((name, path))
    except OSError as error:
        print(f"ERRORE: lettura fallita: {error}. Nessuna scrittura.")
        return 1

    if check_only:
        for name, _path in pending:
            print(f"da applicare: {name}")
        if not pending:
            print("nessuna patch da applicare")
        return 0

    try:
        for path in current:
            if current[path] == original[path]:
                continue
            backup = path + BACKUP_SUFFIX
            if not os.path.exists(backup):
                backup_tmp = backup + ".tmp-pk"
                shutil.copy2(path, backup_tmp)
                os.replace(backup_tmp, backup)
                print(f"backup creato: {backup}")
            tmp = path + ".tmp-pk"
            with open(tmp, "w", encoding="utf-8", newline="") as handle:
                handle.write(current[path])
            os.replace(tmp, path)
    except OSError as error:
        print(f"ERRORE: scrittura fallita: {error}")
        return 1

    for name, _path in pending:
        print(f"applicata: {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
