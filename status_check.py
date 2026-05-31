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

run(client, "pgrep -fa 'python3 app.py'")
run(client, 'ss -tlnp | grep 9000 || echo "not listening"')
run(client, 'cat /home/ztariq/hikmaprof/app.log')

client.close()
