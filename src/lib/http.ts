import { fetch as undiciFetch, ProxyAgent } from "undici";

/**
 * 出站 HTTP 统一入口。
 * Node 20 的内置 fetch 不会读取代理环境变量；在需要代理才能访问外网
 * （Reddit / Anthropic）的网络环境下，通过 undici ProxyAgent 显式走代理。
 * 代理地址取 APP_PROXY_URL 或标准的 HTTPS_PROXY / HTTP_PROXY（.env.local 可配）。
 */
const proxyUrl =
  process.env.APP_PROXY_URL ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  "";

const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export const appFetch: typeof globalThis.fetch = dispatcher
  ? (((input: Parameters<typeof undiciFetch>[0], init?: Record<string, unknown>) =>
      undiciFetch(input, { ...init, dispatcher })) as unknown as typeof globalThis.fetch)
  : globalThis.fetch;

export function proxyInfo(): string {
  return proxyUrl ? `经代理 ${proxyUrl}` : "直连";
}
