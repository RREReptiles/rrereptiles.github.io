import re
from pathlib import Path

INDEX_PATH = Path("index.html")
ASSET_VERSION = "20260729-5"
STYLESHEETS = (
    '    <link rel="stylesheet" href="shop/storefront.css">\n',
    '    <link rel="stylesheet" href="shop/checkout.css">\n',
)
SCRIPTS = (
    ("shop/storefront.js", f"shop/storefront.js?v={ASSET_VERSION}"),
    ("shop/preview-gate.js", f"shop/preview-gate.js?v={ASSET_VERSION}"),
)


def main() -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    original = html

    for stylesheet in STYLESHEETS:
        href = stylesheet.split('href="', 1)[1].split('"', 1)[0]
        if f'href="{href}"' not in html:
            if "</head>" not in html:
                raise RuntimeError("Could not find </head> in index.html")
            html = html.replace("</head>", f"{stylesheet}</head>", 1)

    for base_src, versioned_src in SCRIPTS:
        pattern = re.compile(rf'src="{re.escape(base_src)}(?:\?v=[^"]*)?"')
        if pattern.search(html):
            html = pattern.sub(f'src="{versioned_src}"', html, count=1)
        else:
            if "</body>" not in html:
                raise RuntimeError("Could not find </body> in index.html")
            script = f'    <script src="{versioned_src}" defer></script>\n'
            html = html.replace("</body>", f"{script}</body>", 1)

    if html != original:
        INDEX_PATH.write_text(html, encoding="utf-8")
        print("Injected versioned storefront assets into index.html")
    else:
        print("Versioned storefront assets already present")


if __name__ == "__main__":
    main()
