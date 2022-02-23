import sass
from os import path

DIR=path.join(path.dirname(__file__), "..", "build", "potree")

with open(path.join(DIR, "potree.css")) as f:
    potree_css = f.read()

lines = potree_css.split("\n")
i = 0
for l in lines:
    if ":root{" in l:
        break
    i += 1

root_begin = i
print("Found root begin: line %s" % root_begin )

i = 0
for l in lines[i:]:
    if l.strip() == "}":
        break
    i += 1

root_end = i + 1
print("Found root end: line %s" % root_end)

root_section = "\n".join(lines[root_begin:root_end])

potree_css = root_section + "\n" + "#potree{ " + "\n".join(lines[:root_begin]) + "\n".join(lines[root_end:]) + "}"
print(potree_css)

output = path.join(DIR, "potree.isolated.min.css")
with open(output, 'w') as f:
    f.write(sass.compile(string=potree_css, output_style="compressed"))
    print("Wrote %s" % output)
