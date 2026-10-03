import "server-only";
import { z } from "zod";
import { readJson } from "@/lib/format";

// Thin wrapper over the Slack Web API using the company bot token.

export class SlackError extends Error {
  constructor(public code: string) {
    super(slackMessage(code));
  }
}

function slackMessage(code: string): string {
  const messages: Record<string, string> = {
    not_authed: "Slack isn't set up yet: the company bot token is missing.",
    invalid_auth: "The Slack bot token isn't valid. Ask your admin to check SLACK_BOT_TOKEN.",
    account_inactive: "The Slack app was removed or deactivated in your workspace.",
    users_not_found: "No Slack user with that email.",
    channel_not_found: "Slack channel not found, or Chief isn't in it.",
    not_in_channel: "Chief isn't in that channel yet. Type /invite @Chief in the channel.",
    missing_scope: "The Slack app is missing a permission. Reinstall it from the manifest.",
    ratelimited: "Slack is busy (rate limited). Try again in a minute.",
  };
  return messages[code] ?? `Slack said: ${code}`;
}

export function slackConfigured(): boolean {
  const t = process.env.SLACK_BOT_TOKEN;
  return Boolean(t && t.startsWith("xoxb-"));
}

const base = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough();

async function call<T extends z.ZodTypeAny>(
  method: string,
  params: Record<string, string | number | boolean | undefined>,
  schema: T,
  { post = false }: { post?: boolean } = {},
): Promise<z.infer<T>> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !slackConfigured()) throw new SlackError("not_authed");
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
  );
  const url = `${process.env.SLACK_API_BASE ?? "https://slack.com/api"}/${method}`;
  const res = post
    ? await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(params),
        cache: "no-store",
      })
    : await fetch(`${url}?${new URLSearchParams(clean)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
  if (res.status === 429) throw new SlackError("ratelimited");
  const json = await readJson(res, "Slack");
  const head = base.parse(json);
  if (!head.ok) throw new SlackError(head.error ?? "unknown_error");
  return schema.parse(json);
}

export async function authTest() {
  return call(
    "auth.test",
    {},
    z.object({ team: z.string(), team_id: z.string(), user: z.string(), user_id: z.string(), bot_id: z.string().optional(), url: z.string() }),
  );
}

const slackUser = z.object({
  id: z.string(),
  name: z.string(),
  real_name: z.string().optional(),
  deleted: z.boolean().optional(),
  is_bot: z.boolean().optional(),
  profile: z.object({ email: z.string().optional(), display_name: z.string().optional(), real_name: z.string().optional(), image_48: z.string().optional() }).passthrough(),
}).passthrough();
export type SlackUser = z.infer<typeof slackUser>;

export async function lookupUserByEmail(email: string): Promise<SlackUser | null> {
  try {
    const r = await call("users.lookupByEmail", { email }, z.object({ user: slackUser }));
    return r.user;
  } catch (e) {
    if (e instanceof SlackError && e.code === "users_not_found") return null;
    throw e;
  }
}

/** All active humans in the workspace (paged). */
export async function listUsers(): Promise<SlackUser[]> {
  const out: SlackUser[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await call(
      "users.list",
      { limit: 200, cursor },
      z.object({ members: z.array(slackUser), response_metadata: z.object({ next_cursor: z.string().optional() }).optional() }),
    );
    out.push(...r.members.filter((m) => !m.deleted && !m.is_bot && m.id !== "USLACKBOT"));
    cursor = r.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return out.sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

export function displayName(u: SlackUser): string {
  return u.profile.real_name || u.real_name || u.profile.display_name || u.name;
}

const channel = z.object({
  id: z.string(),
  name: z.string(),
  is_private: z.boolean().optional(),
  is_member: z.boolean().optional(),
  is_archived: z.boolean().optional(),
}).passthrough();
export type SlackChannel = z.infer<typeof channel>;

/** Public + private channels the bot can see, with membership flag. */
export async function listChannels(): Promise<SlackChannel[]> {
  const out: SlackChannel[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await call(
      "conversations.list",
      { types: "public_channel,private_channel", exclude_archived: true, limit: 200, cursor },
      z.object({ channels: z.array(channel), response_metadata: z.object({ next_cursor: z.string().optional() }).optional() }),
    );
    out.push(...r.channels);
    cursor = r.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function postMessage(channelId: string, text: string) {
  return call("chat.postMessage", { channel: channelId, text, unfurl_links: false, unfurl_media: false }, z.object({ ts: z.string(), channel: z.string() }), { post: true });
}

/** Sends a direct message from Chief to a Slack user. */
export async function sendDm(slackUserId: string, text: string) {
  const open = await call("conversations.open", { users: slackUserId }, z.object({ channel: z.object({ id: z.string() }) }), { post: true });
  return postMessage(open.channel.id, text);
}

const historyMessage = z.object({
  ts: z.string(),
  user: z.string().optional(),
  text: z.string().default(""),
  subtype: z.string().optional(),
  thread_ts: z.string().optional(),
  reply_count: z.number().optional(),
  latest_reply: z.string().optional(),
}).passthrough();
export type SlackMessage = z.infer<typeof historyMessage>;

const paged = (key: string) =>
  z.object({ [key]: z.array(historyMessage).default([]), has_more: z.boolean().optional(), response_metadata: z.object({ next_cursor: z.string().optional() }).optional() });

/** Channel messages newer than `oldest` (Slack ts), newest first. Max ~600. */
export async function channelHistory(channelId: string, oldest: string): Promise<SlackMessage[]> {
  const out: SlackMessage[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    const r = (await call("conversations.history", { channel: channelId, oldest, limit: 200, cursor }, paged("messages"))) as unknown as {
      messages: SlackMessage[];
      response_metadata?: { next_cursor?: string };
    };
    out.push(...r.messages);
    cursor = r.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return out;
}

/** Replies in a thread newer than `oldest` (excludes the parent). */
export async function threadReplies(channelId: string, threadTs: string, oldest: string): Promise<SlackMessage[]> {
  const r = (await call("conversations.replies", { channel: channelId, ts: threadTs, oldest, limit: 200 }, paged("messages"))) as unknown as { messages: SlackMessage[] };
  return r.messages.filter((m) => m.ts !== threadTs);
}

export async function userInfo(slackUserId: string): Promise<SlackUser | null> {
  try {
    return (await call("users.info", { user: slackUserId }, z.object({ user: slackUser }))).user;
  } catch {
    return null;
  }
}

/** Builds a message link without an extra API call. */
export function permalink(workspaceUrl: string, channelId: string, ts: string, threadTs?: string) {
  const base = `${workspaceUrl.replace(/\/$/, "")}/archives/${channelId}/p${ts.replace(".", "")}`;
  return threadTs && threadTs !== ts ? `${base}?thread_ts=${threadTs}&cid=${channelId}` : base;
}

/** Checks one channel: does it exist, is Chief in it, and can Chief read it? */
export async function checkChannel(channelId: string): Promise<{ name: string | null; isPrivate: boolean; member: boolean; readable: boolean; problem: string | null }> {
  try {
    const info = await call("conversations.info", { channel: channelId }, z.object({ channel: channel }));
    const ch = info.channel;
    if (!ch.is_member) return { name: ch.name, isPrivate: !!ch.is_private, member: false, readable: false, problem: null };
    try {
      await call("conversations.history", { channel: channelId, limit: 1 }, z.object({}).passthrough());
      return { name: ch.name, isPrivate: !!ch.is_private, member: true, readable: true, problem: null };
    } catch (e) {
      return { name: ch.name, isPrivate: !!ch.is_private, member: true, readable: false, problem: e instanceof Error ? e.message : "Can't read messages." };
    }
  } catch (e) {
    const code = e instanceof SlackError ? e.code : "";
    // Private channels Chief isn't in look "not found" to it.
    if (code === "channel_not_found") return { name: null, isPrivate: true, member: false, readable: false, problem: null };
    return { name: null, isPrivate: false, member: false, readable: false, problem: e instanceof Error ? e.message : "Couldn't check." };
  }
}
