from pathlib import Path

INDEX_PATH = Path("index.html")
STYLESHEET = '    <link rel="stylesheet" href="shop/storefront.css">\n'
SCRIPT = '    <script src="shop/storefront.js" defer></script>\n'


def main() -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    original = html

    if 'href="shop/storefront.css"' not in html:
        if "</head>" not in html:
            raise RuntimeError("Could not find </head> in index.html")
        html = html.replace("</head>", f"{STYLESHEET}</head>", 1)

    if 'src="shop/storefront.js"' not in html:
        if "</body>" not in html:
            raise RuntimeError("Could not find </body> in index.html")
        html = html.replace("</body>", f"{SCRIPT}</body>", 1)

    if html != original:
        INDEX_PATH.write_text(html, encoding="utf-8")
        print("Injected storefront assets into index.html")
    else:
        print("Storefront assets already present")


if __name__ == "__main__":
    main()
