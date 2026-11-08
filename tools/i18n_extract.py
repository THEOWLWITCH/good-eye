"""
i18n helper for עין טובה / Good Eye.

Hebrew is the source language. This script:
  1. wraps every Hebrew string literal in the JS sources with T('...') (once; idempotent),
     skipping comments, regex literals, object keys and data files;
  2. collects all Hebrew strings from the JS (inside T(...)) and from index.html
     (text nodes, placeholder= and title= attributes);
  3. writes tools/i18n_strings.json  ->  { "<hebrew>": "<existing english or ''>" }
Run:  python tools/i18n_extract.py [--wrap]
"""
import json, re, sys, pathlib, html
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
HEB = re.compile(r'[֐-׿]')
SKIP_WRAP = {'js/content/stimuli.js', 'js/content/sentences.js', 'js/content/readaids.js', 'js/core/i18n.js', 'js/core/i18n-en.js'}
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^') | {''}


def js_tokens(src):
    """Yield (start, end, kind) for string literals; kind 'str'. Skips comments and regex literals."""
    i, n = 0, len(src)
    prev = ''          # previous significant char
    prev_word = ''
    while i < n:
        c = src[i]
        if c in ' \t\r\n':
            i += 1; continue
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"`':
            q, j = c, i + 1
            while j < n and src[j] != q:
                j += 2 if src[j] == '\\' else 1
            yield (i, j + 1, q)
            i = j + 1; prev = q; prev_word = ''; continue
        if c == '/' and (prev in REGEX_PREV or prev_word in ('return', 'typeof', 'case')):
            j, in_cls = i + 1, False
            while j < n:
                ch = src[j]
                if ch == '\\': j += 2; continue
                if ch == '[': in_cls = True
                elif ch == ']': in_cls = False
                elif ch == '/' and not in_cls: break
                elif ch == '\n': break
                j += 1
            j += 1
            while j < n and src[j].isalpha(): j += 1
            i = j; prev = '/'; prev_word = ''; continue
        if c.isalnum() or c in '_$':
            j = i
            while j < n and (src[j].isalnum() or src[j] in '_$'): j += 1
            prev_word = src[i:j]; prev = 'a'; i = j; continue
        prev = c; prev_word = ''; i += 1


def safe_unquote(lit):
    import ast
    try:
        return ast.literal_eval(lit)
    except Exception:
        return lit[1:-1].replace("\'", "'").replace('\\"', '"')


def wrap_file(path):
    src = path.read_text(encoding='utf-8')
    out, last, changed = [], 0, 0
    for s, e, q in js_tokens(src):
        lit = src[s:e]
        if q == '`' or not HEB.search(lit):
            continue
        before = src[:s].rstrip()
        after = src[e:].lstrip()
        if before.endswith('T('):
            continue                       # already wrapped
        if after.startswith(':') and before[-1:] in ('{', ','):
            continue                       # object key
        out.append(src[last:s]); out.append('T(' + lit + ')'); last = e; changed += 1
    out.append(src[last:])
    if changed:
        path.write_text(''.join(out), encoding='utf-8')
    return changed


def js_strings(path):
    src = path.read_text(encoding='utf-8')
    found = []
    for s, e, q in js_tokens(src):
        lit = src[s:e]
        if HEB.search(lit) and src[:s].rstrip().endswith('T('):
            found.append(safe_unquote(lit))
    return found


class HtmlCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.found, self.stack = [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        skip = bool('data-noi18n' in a or (self.stack and self.stack[-1]))
        if tag not in ('input', 'br', 'meta', 'link', 'img'):
            self.stack.append(skip)
        if skip:
            return
        for k in ('placeholder', 'title', 'aria-label'):
            v = a.get(k)
            if v and HEB.search(v):
                self.found.append(v.strip())

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in ('input', 'br', 'meta', 'link', 'img') and self.stack:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag not in ('input', 'br', 'meta', 'link', 'img') and self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if self.stack and self.stack[-1]:
            return
        t = ' '.join(data.split())
        if t and HEB.search(t):
            self.found.append(t)


def main():
    wrap = '--wrap' in sys.argv
    files = sorted((ROOT / 'js').rglob('*.js'))
    if wrap:
        for f in files:
            rel = f.relative_to(ROOT).as_posix()
            if rel in SKIP_WRAP:
                continue
            n = wrap_file(f)
            if n:
                print(f'wrapped {n:4d}  {rel}')
    strings = []
    for f in files:
        strings += js_strings(f)
    hc = HtmlCollector()
    hc.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
    strings += hc.found
    out_path = ROOT / 'tools' / 'i18n_strings.json'
    existing = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {}
    merged, seen = {}, set()
    for s in strings:
        if s in seen:
            continue
        seen.add(s)
        merged[s] = existing.get(s, '')
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding='utf-8')
    missing = sum(1 for v in merged.values() if not v)
    print(f'{len(merged)} strings, {missing} without English')


if __name__ == '__main__':
    main()
