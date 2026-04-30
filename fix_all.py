#!/usr/bin/env python3
"""Fix nginx config and restart Flask via paramiko."""

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
    """Run sudo command by sending password to stdin."""
    print(f'$ sudo {cmd}')
    chan = client.get_transport().open_session()
    chan.exec_command(f'sudo -S {cmd}')
    chan.sendall(PASSWORD.encode() + b'\n')
    time.sleep(0.5)
    out = chan.makefile().read().decode()
    chan.close()
    if out.strip():
        print(out.strip())
    return out


def run(client, cmd, timeout=15):
    print(f'$ {cmd}')
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    try:
        out = stdout.read().decode()
        err = stderr.read().decode()
    except Exception:
        out = err = ''
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

    # Check Flask status
    print('=== Flask status ===')
    run(client, "pgrep -fa 'python3 app.py' || echo 'Flask NOT running'")
    run(client, 'ss -tlnp | grep 9000 || echo "Port 9000 not listening"')

    # Start Flask if not running
    out = run(client, "pgrep -fa 'python3 app.py'")
    if 'app.py' not in out:
        print('\nStarting Flask...')
        run(client, "pkill -f 'python3 app.py' || true")
        _, stdout, _ = client.exec_command(
            'cd /home/ztariq/HikmaProf && nohup python3 app.py --port 9000 > app.log 2>&1 &',
            timeout=5)
        time.sleep(4)
        run(client, "pgrep -fa 'python3 app.py'")
        run(client, 'ss -tlnp | grep 9000')

    run(client, 'tail -15 /home/ztariq/HikmaProf/app.log')

    # Check if nginx block already there
    print('\n=== Nginx config check ===')
    out = run(client, 'cat /etc/nginx/sites-enabled/hikma')
    if '/HikmaProf' in out:
        print('HikmaProf nginx block already present.')
        client.close()
        return

    # Write new nginx config
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
    print('New config written to /tmp/hikma_new.conf')

    # Try sudo with -S reading from stdin
    print('\n=== Configuring nginx (sudo) ===')
    run_sudo(client, 'cp /etc/nginx/sites-enabled/hikma /etc/nginx/sites-enabled/hikma.bak')
    run_sudo(client, 'cp /tmp/hikma_new.conf /etc/nginx/sites-enabled/hikma')
    out = run_sudo(client, 'nginx -t')

    if 'successful' in out.lower() or 'ok' in out.lower():
        run_sudo(client, 'nginx -s reload')
        print('Nginx reloaded.')
    else:
        print('Test output:', repr(out))
        run_sudo(client, 'cp /etc/nginx/sites-enabled/hikma.bak /etc/nginx/sites-enabled/hikma')

    # Show final state
    run(client, "grep -c 'HikmaProf' /etc/nginx/sites-enabled/hikma || echo 'Block not found'")

    client.close()
    print('\nDone. Visit https://hikma.hbku.edu.qa/HikmaProf/')


if __name__ == '__main__':
    main()
