// Embedded dedicated residential proxy routing for OpenCode Free V2
// Locked and managed: displayed as https://t.me/abcseren in UI

export const OPENCODE_V2_LOCKED_PROXY_NAME = "https://t.me/abcseren";
export const OPENCODE_V2_LOCKED_PROXY_ID = "locked:opencode-v2";

const EMBEDDED_PROXY_B64 = "aHR0cDovL3Jlcy1nYi1zaWQtODIyNTE3NDc0OnBndy1jNDYyYjMxYzNhMjgxZjEwMmM3ZmZhNzcwOGY4MTExNWI4NDQwMDVlODQ3ZGQxODhAYWxpeXVuLmRlbm5hay5jb206NDQz";

export function getOpencodeV2ProxyUrl() {
  let url = process.env.OPENCODE_V2_PROXY;
  if (!url) {
    try {
      url = Buffer.from(EMBEDDED_PROXY_B64, "base64").toString("utf-8");
    } catch {
      url = "";
    }
  }
  if (!url) return "";

  // Randomize session ID for rotating residential proxy
  if (/-sid-\d+/i.test(url)) {
    const randSid = Math.floor(100000000 + Math.random() * 900000000);
    return url.replace(/-sid-\d+/i, `-sid-${randSid}`);
  }
  return url;
}
