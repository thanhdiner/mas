import json
import subprocess

try:
    out = subprocess.check_output(['python', '-m', 'ruff', 'check', '--output-format', 'json'])
except subprocess.CalledProcessError as e:
    out = e.output

for e in json.loads(out):
    print(f"{e['filename']}:{e['location']['row']} {e['code']} {e['message']}")
