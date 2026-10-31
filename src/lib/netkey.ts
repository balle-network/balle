/*
 * Rate-limit keys for a client address. IPv4 is kept whole and also counted
 * in its /24; IPv6 is cut to its /64 (one subscriber usually holds a whole
 * /64 and could rotate inside it) and also counted in its /48, so renting
 * many /64s from one allocation does not multiply the budget.
 */

function groups(addr: string) {
  const [head, tail = ""] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = addr.includes("::") && tail ? tail.split(":") : [];
  const all = addr.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return all.map((g) => (g || "0").replace(/^0+(?=.)/, ""));
}

function clean(ip: string) {
  const addr = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : addr;
}

/** The address's own key: IPv4 whole, IPv6 /64. */
export function networkKey(ip: string) {
  const addr = clean(ip);
  if (!addr.includes(":")) return addr;
  return `${groups(addr).slice(0, 4).join(":")}::/64`;
}

/** The wider aggregate the address belongs to: IPv4 /24, IPv6 /48. */
export function networkAggregate(ip: string) {
  const addr = clean(ip);
  if (!addr.includes(":")) {
    const parts = addr.split(".");
    return parts.length === 4 ? `${parts.slice(0, 3).join(".")}.0/24` : addr;
  }
  return `${groups(addr).slice(0, 3).join(":")}::/48`;
}
