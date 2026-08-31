#!/usr/bin/env python3
"""Build the Claude Artifact version of the bible from index.html.

The Artifact host supplies the document skeleton and blocks external images,
so the published page is the <title>, the font <link>, the <style> and the
body content, with every asset inlined as a data: URI.

    python3 dirty-gold/build-artifact.py [output.html]
"""
import base64
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "dirty-gold-bible.artifact.html")

# Only meaningful on a real host; the Artifact host provides its own.
STRIP = (
    r'\s*<meta name="robots"[^>]*>',
    r'\s*<meta name="description"[^>]*>',
    r'\s*<link rel="preconnect"[^>]*>',
)


def data_uri(rel_path):
    mime = "image/png" if rel_path.endswith(".png") else "image/jpeg"
    with open(os.path.join(HERE, rel_path), "rb") as handle:
        return "data:%s;base64,%s" % (mime, base64.b64encode(handle.read()).decode("ascii"))


def build():
    with open(os.path.join(HERE, "index.html"), encoding="utf-8") as handle:
        src = handle.read()

    head = src[src.index("<title>"):src.index("</head>")]
    body = src[src.index("<body>") + len("<body>"):src.index("</body>")]
    for pattern in STRIP:
        head = re.sub(pattern, "", head)

    page = head.strip() + "\n" + body
    for rel_path in sorted(set(re.findall(r'"(assets/[^"]+)"', page))):
        page = page.replace('"%s"' % rel_path, '"%s"' % data_uri(rel_path))

    assert "assets/" not in page, "an asset reference was left un-inlined"
    assert "<body" not in page, "the document skeleton must not be published"
    return page


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    page = build()
    with open(out, "w", encoding="utf-8") as handle:
        handle.write(page)
    print("%s — %.2f MB (Artifact limit is 16 MB)" % (out, len(page) / 1024 / 1024))
