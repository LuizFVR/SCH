const UNROUTABLE_HOSTS = new Set(["0.0.0.0", "[::]", "::"]);

export function configuredAdminUrl(path: string) {
  const configuredHost = process.env.ADMIN_HOST?.trim();
  if (!configuredHost) return null;

  try {
    const configuredUrl = new URL(configuredHost);
    if (configuredUrl.protocol === "http:" || configuredUrl.protocol === "https:") {
      return new URL(path, `${configuredUrl.origin}/`);
    }
  } catch {
    return null;
  }
  return null;
}

export function adminUrl(path: string, request: Request) {
  const configuredUrl = configuredAdminUrl(path);
  if (configuredUrl) return configuredUrl;

  const requestUrl = new URL(request.url);
  if (UNROUTABLE_HOSTS.has(requestUrl.hostname)) requestUrl.hostname = "localhost";
  return new URL(path, requestUrl);
}
