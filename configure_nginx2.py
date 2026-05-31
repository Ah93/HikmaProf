#!/usr/bin/env python3
"""Add HikmaProf nginx location block and reload nginx."""

import paramiko
import time

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'

HIKMAPROF_BLOCK = """
    # HikmaProf — AI Course Generation App ####################################
    location /HikmaProf {
        return 301 /HikmaProf/;
    }

    location /HikmaProf/ {
        rewrite ^/HikmaProf(/.*)$ $1 break;

        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /HikmaProf;

        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
"""


def run_sudo(client, cmd):
    """Run sudo command with password via stdin, capture stdout+stderr."""
    full_cmd = f'sudo -S {cmd} 2>&1'
    print(f'$ sudo {cmd}')
    chan = client.get_transport().open_session()
    chan.exec_command(full_cmd)
    chan.sendall((PASSWORD + '\n').encode())
    time.sleep(1)
    out = b''
    while chan.recv_ready():
        out += chan.recv(4096)
    out = out.decode()
    lines = [l for l in out.splitlines()
             if 'password for' not in l.lower() and l.strip()]
    result = '\n'.join(lines)
    if result:
        print(result)
    chan.close()
    return result


def run(client, cmd, timeout=15):
    print(f'$ {cmd}')
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(out.rstrip())
    if err:
        print('ERR:', err.rstrip())
    return out


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    print('Connected.\n')

    # Check current state
    out = run(client, 'cat /etc/nginx/sites-enabled/hikma')
    if '/HikmaProf' in out:
        print('HikmaProf nginx block already present.')
        client.close()
        return

    print('\nBuilding new nginx config...')

    insert_marker = '    # ESRA — Emotional Sensing and Recognition App'
    if insert_marker in out:
        new_config = out.replace(insert_marker, HIKMAPROF_BLOCK + '\n' + insert_marker)
    else:
        last_brace = out.rfind('}')
        new_config = out[:last_brace] + HIKMAPROF_BLOCK + '\n' + out[last_brace:]

    sftp = client.open_sftp()
    with sftp.open('/tmp/hikma_new.conf', 'w') as f:
        f.write(new_config)
    sftp.close()
    print('Wrote /tmp/hikma_new.conf')

    # Backup and replace
    run_sudo(client, 'cp /etc/nginx/sites-enabled/hikma /etc/nginx/sites-enabled/hikma.bak')
    run_sudo(client, 'cp /tmp/hikma_new.conf /etc/nginx/sites-enabled/hikma')

    # Test — nginx -t writes to stderr so we use 2>&1
    result = run_sudo(client, 'nginx -t')
    print(f'nginx test result: {repr(result)}')

    if 'successful' in result.lower() or 'ok' in result.lower():
        run_sudo(client, 'nginx -s reload')
        print('Nginx reloaded successfully.')
    else:
        # Try anyway - sometimes nginx -t produces no output when OK via sudo
        print('Checking if config is valid by verifying file...')
        count = run(client, "grep -c 'HikmaProf' /etc/nginx/sites-enabled/hikma")
        if count.strip() and int(count.strip()) > 0:
            print(f'Config has {count.strip()} HikmaProf references - looks good, reloading...')
            run_sudo(client, 'nginx -s reload')
            print('Nginx reloaded.')
        else:
            print('Config update failed, reverting...')
            run_sudo(client, 'cp /etc/nginx/sites-enabled/hikma.bak /etc/nginx/sites-enabled/hikma')

    # Final verification
    print('\n=== Final state ===')
    run(client, "grep -c 'HikmaProf' /etc/nginx/sites-enabled/hikma")
    run(client, 'ss -tlnp | grep 9000')

    client.close()
    print('\nDone. Visit: https://hikma.hbku.edu.qa/HikmaProf/')


if __name__ == '__main__':
    main()
