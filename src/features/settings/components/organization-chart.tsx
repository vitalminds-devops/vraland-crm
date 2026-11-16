"use client";

import { ArrowUpRight, GitBranch, Mail, Search, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avatarSrc } from "@/features/account/lib/avatar";
import { initialsOf } from "./users/user-types";

import styles from "./css/organization-chart.module.css";

type OrgChartUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  avatarUrl: string | null;
  brokerId: string | null;
  roles: { id: string; name: string }[];
};

type OrgNode = OrgChartUser & { children: OrgNode[] };

const roleTiers = [
  "super administrator",
  "administrator",
  "sales manager",
  "broker",
  "agent",
  "viewer",
];

function roleTier(user: OrgChartUser) {
  const names = user.roles.map((role) => role.name.toLowerCase());
  const tier = roleTiers.findIndex((role) =>
    names.some((name) => name === role || name.includes(role)),
  );
  return tier < 0 ? roleTiers.length : tier;
}

function makeTree(users: OrgChartUser[]) {
  const nodes = new Map(users.map((user) => [user.id, { ...user, children: [] } as OrgNode]));
  const roots: OrgNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.brokerId ? nodes.get(node.brokerId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const visited = new Set<string>();
  const markReachable = (node: OrgNode, path: Set<string>) => {
    if (path.has(node.id) || visited.has(node.id)) return;
    visited.add(node.id);
    const nextPath = new Set(path).add(node.id);
    node.children.forEach((child) => markReachable(child, nextPath));
  };
  roots.forEach((root) => markReachable(root, new Set()));
  for (const node of nodes.values()) {
    if (!visited.has(node.id)) {
      roots.push(node);
      markReachable(node, new Set());
    }
  }

  const sortNodes = (branch: OrgNode[]) => {
    branch.sort(
      (left, right) =>
        roleTier(left) - roleTier(right) ||
        `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`),
    );
    branch.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);

  return roots;
}

function filterTree(users: OrgChartUser[], roots: OrgNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return { roots, matchCount: users.length };

  const matches = users.filter((user) =>
    [user.firstName, user.lastName, user.email, ...user.roles.map((role) => role.name)]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const visibleIds = new Set<string>();
  const usersById = new Map(users.map((user) => [user.id, user]));
  const childrenByParent = new Map<string, string[]>();

  for (const user of users) {
    if (!user.brokerId || !usersById.has(user.brokerId)) continue;
    const children = childrenByParent.get(user.brokerId) ?? [];
    children.push(user.id);
    childrenByParent.set(user.brokerId, children);
  }

  const includeDescendants = (userId: string, path: Set<string>) => {
    if (path.has(userId) || visibleIds.has(userId)) return;
    visibleIds.add(userId);
    const nextPath = new Set(path).add(userId);
    for (const childId of childrenByParent.get(userId) ?? []) includeDescendants(childId, nextPath);
  };

  for (const user of matches) {
    visibleIds.add(user.id);
    includeDescendants(user.id, new Set());
    let parentId = user.brokerId;
    const ancestorPath = new Set([user.id]);
    while (parentId && !ancestorPath.has(parentId)) {
      ancestorPath.add(parentId);
      visibleIds.add(parentId);
      parentId = usersById.get(parentId)?.brokerId ?? null;
    }
  }

  const keepVisibleNodes = (nodes: OrgNode[]): OrgNode[] =>
    nodes.flatMap((node) => {
      if (!visibleIds.has(node.id)) return [];
      return [{ ...node, children: keepVisibleNodes(node.children) }];
    });

  return { roots: keepVisibleNodes(roots), matchCount: matches.length };
}

function ChartNode({
  node,
  selectedUserId,
  onSelect,
}: {
  node: OrgNode;
  selectedUserId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <li className={styles.node}>
      <button
        type="button"
        aria-pressed={selectedUserId === node.id}
        onClick={() => onSelect(node.id)}
        className={`${styles.nodeCard} ${selectedUserId === node.id ? styles.selectedNode : ""}`}
      >
        <span className={styles.nodeMeta}>
          <span className={styles.status} data-status={node.status}>
            {node.status}
          </span>
          <ArrowUpRight size={14} aria-hidden="true" className={styles.nodeArrow} />
        </span>
        <header className={styles.nodeHeading}>
          <span className={styles.avatar} aria-hidden="true">
            {node.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
              <img src={avatarSrc(node.id, node.avatarUrl) ?? ""} alt="" />
            ) : (
              initialsOf(node)
            )}
          </span>
          <span className={styles.nodeHeadingText}>
            <span className={styles.nodeName} title={`${node.firstName} ${node.lastName}`}>
              {node.firstName} {node.lastName}
            </span>
            <span className={styles.nodeRole}>
              {node.roles.map((role) => role.name).join(", ") || "No role"}
            </span>
          </span>
        </header>
        <div className={styles.nodeDetails}>
          <Mail size={13} aria-hidden="true" />
          <span className={styles.nodeEmail} title={node.email}>
            {node.email}
          </span>
        </div>
        <span className={styles.nodeFooter}>
          <Users size={13} aria-hidden="true" />
          User details
          <span className={styles.selectionLabel}>
            {selectedUserId === node.id ? "Selected" : "Select"}
          </span>
        </span>
      </button>
      {node.children.length > 0 && (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <ChartNode
              key={child.id}
              node={child}
              selectedUserId={selectedUserId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrganizationChart({ users }: { users: OrgChartUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const pan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const roots = makeTree(users);
  const filtered = filterTree(users, roots, query);

  function endPan(event: PointerEvent<HTMLDivElement>) {
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section aria-label="Organization chart" className={styles.workspace}>
      <div className={styles.workspaceHeading}>
        <span className={styles.headingIcon}>
          <GitBranch size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className={styles.title}>Team structure</h2>
          <p className={styles.subtitle}>Explore your people and their reporting relationships.</p>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Search users in organization chart</span>
            <Search
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or role"
              className="h-10 w-full rounded-lg border bg-background pl-9 pr-10 text-sm"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded hover:bg-muted"
              >
                <X aria-hidden="true" size={15} />
              </Button>
            )}
          </label>
          <div className="flex shrink-0 items-center gap-3">
            <p className={styles.userCount} aria-live="polite">
              <Users size={14} aria-hidden="true" />
              {query
                ? `${filtered.matchCount} matching ${filtered.matchCount === 1 ? "user" : "users"}`
                : `${users.length} ${users.length === 1 ? "user" : "users"}`}
            </p>
            {selectedUserId && (
              <Button
                size="sm"
                type="button"
                onClick={() => router.push(`/settings/users/${encodeURIComponent(selectedUserId)}`)}
                className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                View selected user
              </Button>
            )}
          </div>
        </div>
      </div>

      <div
        className={styles.canvas}
        tabIndex={0}
        role="region"
        aria-label="Reporting hierarchy, scroll to explore"
        data-panning={isPanning}
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          const canvas = event.currentTarget;
          const bounds = canvas.getBoundingClientRect();
          if (
            event.clientX - bounds.left >= canvas.clientWidth ||
            event.clientY - bounds.top >= canvas.clientHeight
          )
            return;
          pan.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: canvas.scrollLeft,
            top: canvas.scrollTop,
          };
        }}
        onPointerMove={(event) => {
          const start = pan.current;
          if (!start || start.pointerId !== event.pointerId) return;
          if (event.buttons !== 1) return endPan(event);
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (!suppressClick.current && Math.hypot(dx, dy) < 5) return;
          suppressClick.current = true;
          setIsPanning(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.scrollLeft = start.left - dx;
          event.currentTarget.scrollTop = start.top - dy;
        }}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={endPan}
        onClickCapture={(event) => {
          if (suppressClick.current && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        {filtered.roots.length > 0 ? (
          <ul className={styles.tree}>
            {filtered.roots.map((node) => (
              <ChartNode
                key={node.id}
                node={node}
                selectedUserId={selectedUserId}
                onSelect={setSelectedUserId}
              />
            ))}
          </ul>
        ) : (
          <div className={styles.emptyState}>
            <Users size={28} aria-hidden="true" />
            <p>{query ? "No people found" : "Your team starts here"}</p>
            <span>
              {query
                ? "Try a different name, email or role."
                : "Users will appear here when they are added."}
            </span>
          </div>
        )}
      </div>
      <div className={styles.canvasFooter}>
        <span>
          <span className={styles.connectionKey} aria-hidden="true" /> Reporting relationship
        </span>
        <span>Drag or scroll to explore · Select a card to view a user</span>
      </div>
    </section>
  );
}
