#!/usr/bin/env python3
import paramiko, time

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'

def run_sudo(client, cmd):
    print(f'$ sudo {cmd}')
    chan = client.get_transport().open_session()
    chan.exec_command(f'sudo -S {cmd} 2>&1')
    chan.sendall((PASSWORD + '\n').encode())
    time.sleep(1)
    out = b''
    while chan.recv_ready():
        out += chan.recv(4096)
    result = out.decode()
    lines = [l for l in result.splitlines() if 'password for' not in l.lower() and l.strip()]
    if lines: print('\n'.join(lines))
    chan.close()
    return '\n'.join(lines)

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
print('Connected.\n')

# Read current config
out = run(client, 'cat /etc/nginx/sites-enabled/hikma')

# Replace /HikmaProf with /hikmaprof in the location blocks
new_config = out.replace(
    'location /HikmaProf {',
    'location /hikmaprof {'
).replace(
    'return 301 /HikmaProf/;',
    'return 301 /hikmaprof/;'
).replace(
    'location /HikmaProf/ {',
    'location /hikmaprof/ {'
).replace(
    'rewrite ^/HikmaProf(/.*)$ $1 break;',
    'rewrite ^/hikmaprof(/.*)$ $1 break;'
).replace(
    'proxy_set_header X-Forwarded-Prefix /HikmaProf;',
    'proxy_set_header X-Forwarded-Prefix /hikmaprof;'
)

if new_config == out:
    print('No /HikmaProf references found in nginx config.')
else:
    sftp = client.open_sftp()
    with sftp.open('/tmp/hikma_new.conf', 'w') as f:
        f.write(new_config)
    sftp.close()

    run_sudo(client, 'cp /etc/nginx/sites-enabled/hikma /etc/nginx/sites-enabled/hikma.bak')
    run_sudo(client, 'cp /tmp/hikma_new.conf /etc/nginx/sites-enabled/hikma')
    result = run_sudo(client, 'nginx -t')
    if 'successful' in result.lower() or 'ok' in result.lower():
        run_sudo(client, 'nginx -s reload')
        print('\nNginx reloaded.')
    else:
        print('Test failed, reverting.')
        run_sudo(client, 'cp /etc/nginx/sites-enabled/hikma.bak /etc/nginx/sites-enabled/hikma')

print('\n=== Verification ===')
run(client, "grep 'hikmaprof\|HikmaProf' /etc/nginx/sites-enabled/hikma")
client.close()
print('\nDone. Visit: https://hikma.hbku.edu.qa/hikmaprof/')
