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


def sudo(client, cmd, timeout=30):
    """Run a command with sudo, supplying password via stdin."""
    full_cmd = f'echo {PASSWORD} | sudo -S {cmd} 2>&1'
    print(f'$ sudo {cmd}')
    _, stdout, _ = client.exec_command(full_cmd, timeout=timeout)
    out = stdout.read().decode()
    # Filter out the sudo password prompt line
    lines = [l for l in out.splitlines() if not l.startswith('[sudo]') and 'password for' not in l.lower()]
    result = '\n'.join(lines).strip()
    if result:
        print(result)
    return result


def run(client, cmd, timeout=30):
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

    # Read current nginx config
    out = run(client, 'cat /etc/nginx/sites-enabled/hikma')

    if '/HikmaProf' in out:
        print('\nHikmaProf nginx block already present.')
    else:
        print('\nAdding HikmaProf block to nginx config...')

        # Insert before the ESRA section
        insert_marker = '    # ESRA — Emotional Sensing and Recognition App'
        if insert_marker in out:
            new_config = out.replace(insert_marker, HIKMAPROF_BLOCK + '\n' + insert_marker)
        else:
            last_brace = out.rfind('}')
            new_config = out[:last_brace] + HIKMAPROF_BLOCK + '\n' + out[last_brace:]

        # Write new config via sftp
        sftp = client.open_sftp()
        with sftp.open('/tmp/hikma_new.conf', 'w') as f:
            f.write(new_config)
        sftp.close()
        print('Wrote new config to /tmp/hikma_new.conf')

        sudo(client, 'cp /etc/nginx/sites-enabled/hikma /etc/nginx/sites-enabled/hikma.bak')
        sudo(client, 'cp /tmp/hikma_new.conf /etc/nginx/sites-enabled/hikma')

        result = sudo(client, 'nginx -t')
        if 'successful' in result.lower() or 'ok' in result.lower():
            print('Config OK. Reloading nginx...')
            sudo(client, 'nginx -s reload')
            print('Nginx reloaded.')
        else:
            print('Nginx test failed. Reverting...')
            sudo(client, 'cp /etc/nginx/sites-enabled/hikma.bak /etc/nginx/sites-enabled/hikma')

    # Also restart Flask to pick up app.py changes
    print('\n=== Restarting Flask app ===')
    run(client, "pkill -f 'python3 app.py' || true")
    time.sleep(1)
    _, stdout, _ = client.exec_command(
        f'cd /home/ztariq/HikmaProf && bash -c \'nohup python3 app.py --port 9000 > app.log 2>&1 & echo $!\'',
        timeout=10)
    pid = stdout.read().decode().strip()
    print(f'Flask started with PID: {pid}')
    time.sleep(3)

    run(client, 'tail -10 /home/ztariq/HikmaProf/app.log')
    run(client, 'ss -tlnp | grep 9000')

    # Verify nginx config has the block
    print('\n=== Current nginx config (HikmaProf section) ===')
    run(client, "grep -A5 'HikmaProf' /etc/nginx/sites-enabled/hikma | head -20")

    client.close()
    print('\nDone. Visit: https://hikma.hbku.edu.qa/HikmaProf/')


if __name__ == '__main__':
    main()
