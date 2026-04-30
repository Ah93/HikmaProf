#!/usr/bin/env python3
import paramiko, time

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'

def run(client, cmd, timeout=15):
    print(f'$ {cmd}')
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.rstrip())
    if err: print('ERR:', err.rstrip())
    return out

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=15)

run(client, 'ls ~/')
run(client, 'ls ~/hikmaprof/ 2>/dev/null || echo "hikmaprof folder not found"')
run(client, 'ls ~/HikmaProf/ 2>/dev/null || echo "HikmaProf folder not found"')
run(client, "pgrep -fa 'python3 app.py' || echo 'Flask not running'")
run(client, 'ss -tlnp | grep 9000 || echo "Port 9000 not listening"')
client.close()
