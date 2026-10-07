"""Build ../index.html from the sources in this folder.

Usage: python3 src/build.py   (from the repository root, or from src/)
"""
import os
import re

here = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(here, name), encoding='utf-8') as f:
        return f.read()


body = read('app.src.html').replace('/*__TRACKER__*/', read('tracker.js')).replace('/*__SCENE__*/', read('scene.js'))
head = (
    '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '<meta name="theme-color" content="#080c1a">\n'
)
m = re.match(r'(<title>.*?</title>\s*(?:<link[^>]*>\s*)+<style>.*?</style>)(.*)', body, re.S)
full = head + m.group(1) + '\n</head>\n<body>\n' + m.group(2) + '\n</body>\n</html>\n'
out = os.path.join(here, '..', 'index.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(full)
print('wrote', os.path.normpath(out), len(full), 'bytes')
