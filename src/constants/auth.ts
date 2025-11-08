import { match } from "ts-pattern";

const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up"] as const;
const PUBLIC_PREFIXES = [
  "/_next",
  "/api",
  "/favicon",
  "/static",
  "/docs",
  "/images",
] as const;

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const AUTH_ENTRY_PATHS = [SIGN_IN_PATH, SIGN_UP_PATH] as const;

export const isAuthEntryPath = (
  pathname: string
): pathname is (typeof AUTH_ENTRY_PATHS)[number] =>
  AUTH_ENTRY_PATHS.includes(pathname as (typeof AUTH_ENTRY_PATHS)[number]);

export const isAuthPublicPath = (pathname: string) => {
  const normalized = pathname.toLowerCase();

  return match(normalized)
    .when(
      (path) => PUBLIC_PATHS.some((publicPath) => publicPath === path),
      () => true
    )
    .when(
      (path) => PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix)),
      () => true
    )
    .otherwise(() => false);
};

export const shouldProtectPath = (pathname: string) =>
  !isAuthPublicPath(pathname);
