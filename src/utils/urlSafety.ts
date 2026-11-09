/**
 * Outbound URL guard for `fetchContent`: only public http(s) targets.
 *
 * `fetch-content` takes a caller-chosen URL, and `research-source` fetches
 * search-result URLs, so without this check the server could be pointed at
 * localhost services, the LAN, or cloud metadata (169.254.169.254).
 */
import { lookup } from "dns/promises";
import { isIP } from "net";

/** Thrown when a URL (or a redirect hop) is refused. Never retried. */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** IPv4 ranges that are not publicly routable: [network, prefix length]. */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

/** IPv6 ranges that are not publicly routable: [network, prefix length]. */
const BLOCKED_V6: Array<[string, number]> = [
  ["::", 96], // unspecified, loopback, IPv4-compatible
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];

/** IPv6 prefixes that carry an IPv4 address, which is checked in turn. */
const EMBEDS_V4: Array<[string, number, number]> = [
  // [network, prefix length, byte offset of the embedded IPv4]
  ["::ffff:0:0", 96, 12], // IPv4-mapped
  ["::ffff:0:0:0", 96, 12], // IPv4-translated (SIIT)
  ["64:ff9b::", 96, 12], // NAT64 well-known prefix
  ["2002::", 16, 2], // 6to4
];

const v4Bytes = (ip: string): number[] => ip.split(".").map(Number);

function v6Bytes(ip: string): number[] {
  let addr = ip.replace(/%.*$/, ""); // drop a zone id (fe80::1%eth0)
  const tail: number[] = [];
  const dotted = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    tail.push(...v4Bytes(dotted[1]));
    addr = addr.slice(0, -dotted[1].length) + "0:0";
  }
  const [head, rest] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const fill =
    rest !== undefined ? new Array(8 - left.length - right.length).fill("0") : [];
  const bytes: number[] = [];
  for (const group of [...left, ...fill, ...right]) {
    const n = parseInt(group, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function inRange(addr: number[], net: number[], bits: number): boolean {
  for (let i = 0; i < bits; i++) {
    const mask = 0x80 >> i % 8;
    if ((addr[i >> 3] & mask) !== (net[i >> 3] & mask)) return false;
  }
  return true;
}

/** True when an IPv4 or IPv6 literal is loopback, private, link-local, etc. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const bytes = v4Bytes(ip);
    return BLOCKED_V4.some(([net, bits]) => inRange(bytes, v4Bytes(net), bits));
  }
  if (family === 6) {
    const bytes = v6Bytes(ip);
    for (const [net, bits, offset] of EMBEDS_V4) {
      if (inRange(bytes, v6Bytes(net), bits)) {
        return isBlockedAddress(bytes.slice(offset, offset + 4).join("."));
      }
    }
    return BLOCKED_V6.some(([net, bits]) => inRange(bytes, v6Bytes(net), bits));
  }
  return true; // not an IP literal: refuse rather than guess
}

/**
 * Parses `raw` and checks that it is http(s) and that its host, and every
 * address the host resolves to, is publicly routable. Returns the parsed URL.
 *
 * The host is resolved again by `fetch` itself, so a DNS record that flips
 * between the two lookups (rebinding) is not covered; closing that would need
 * a custom connection dispatcher.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only HTTP(S) protocols are supported");
  }

  // URL already normalizes IPv4 forms like 0x7f.1 or 2130706433 to dotted
  // decimal; IPv6 literals keep their brackets.
  const host = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map(
        (a) => a.address
      );
    } catch (error) {
      throw new Error(`Could not resolve ${host}: ${error}`);
    }
  }

  const blocked = addresses.find(isBlockedAddress);
  if (blocked) {
    throw new BlockedUrlError(
      `Refusing to fetch ${host}: it resolves to a private or reserved address (${blocked})`
    );
  }
  return url;
}
