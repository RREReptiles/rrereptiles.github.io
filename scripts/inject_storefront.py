from pathlib import Path

INDEX_PATH = Path("index.html")
STYLESHEETS = (
    '    <link rel="stylesheet" href="shop/storefront.css">\n',
    '    <link rel="stylesheet" href="shop/checkout.css">\n',
)
SCRIPTS = (
    '    <script src="shop/storefront.js" defer></script>\n',
    '    <script src="shop/preview-gate.js" defer></script>\n',
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

    for script in SCRIPTS:
        src = script.split('src="', 1)[1].split('"', 1)[0]
        if f'src="{src}"' not in html:
            if "</body>" not in html:
                raise RuntimeError("Could not find </body> in index.html")
            html = html.replace("</body>", f"{script}</body>", 1)

    if html != original:
        INDEX_PATH.write_text(html, encoding="utf-8")
        print("Injected storefront assets into index.html")
    else:
        print("Storefront assets already present")


if __name__ == "__main__":
    main()
