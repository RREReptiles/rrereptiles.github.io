"""Allow existing SEO pages to remain published during a quota restriction.

An unavailable catalog must never be interpreted as an empty catalog: that
would replace real product pages with an empty generated site.
"""

import urllib.error

import build_seo


def main() -> int:
    try:
        build_seo.fetch_catalog(None)
    except RuntimeError as error:
        cause = error.__cause__
        if isinstance(cause, urllib.error.HTTPError) and cause.code == 402:
            print("Supabase returned HTTP 402; retaining verified existing SEO pages.")
            return 42
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
