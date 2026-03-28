import subprocess
try:
    subprocess.check_call(['pytest', 'tests'], stdout=open('output.utf8', 'w', encoding='utf-8'), stderr=subprocess.STDOUT)
except subprocess.CalledProcessError:
    pass
