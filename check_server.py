#!/usr/bin/env python3
import paramiko

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'

def run(client, cmd, timeout=15):
    print(f'\n$ {cmd}')
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.rstrip())
    if err: print('ERR:', err.rstrip())
    return out

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=15)

run(client, 'nginx -v 2>&1 || echo "nginx not found"')
run(client, 'apache2 -v 2>&1 || apachectl -v 2>&1 || echo "apache not found"')
run(client, 'ls /etc/nginx/sites-enabled/ 2>/dev/null || ls /etc/nginx/conf.d/ 2>/dev/null || echo "no nginx sites"')
run(client, 'cat /etc/nginx/sites-enabled/* 2>/dev/null || cat /etc/nginx/conf.d/*.conf 2>/dev/null || echo "no nginx config found"')
run(client, 'ls /etc/apache2/sites-enabled/ 2>/dev/null || echo "no apache sites"')
run(client, 'cat /etc/apache2/sites-enabled/* 2>/dev/null || echo "no apache config"')
run(client, 'ps aux | grep -E "nginx|apache|httpd" | grep -v grep')
run(client, 'ss -tlnp | grep -E "80|443"')

client.close()
