#!/usr/bin/env python3
"""Sync updated files and configure nginx for /HikmaProf subpath."""

import paramiko
import time

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'
REMOTE_DIR = '/home/ztariq/HikmaProf'

NGINX_BLOCK = """
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

FILES_TO_SYNC = [
    ('app.py', f'{REMOTE_DIR}/app.py'),
    ('templates/home.html', f'{REMOTE_DIR}/templates/home.html'),
    ('templates/about.html', f'{REMOTE_DIR}/templates/about.html'),
    ('templates/index_desktop.html', f'{REMOTE_DIR}/templates/index_desktop.html'),
    ('static/js/desktop-ui.js', f'{REMOTE_DIR}/static/js/desktop-ui.js'),
]


def run(client, cmd, timeout=30):
    print(f'$ {cmd}')
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=False)
    try:
        out = stdout.read().decode()
        err = stderr.read().decode()
    except Exception as e:
        out, err = '', str(e)
    if out:
        print(out.rstrip())
    if err:
        print('ERR:', err.rstrip())
    return out, err


def main():
    import os
    local_base = os.path.dirname(__file__)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    print('Connected.\n')

    # Sync changed files
    print('=== Syncing changed files ===')
    sftp = client.open_sftp()
    for local_rel, remote_path in FILES_TO_SYNC:
        local_path = os.path.join(local_base, local_rel)
        print(f'  {local_rel} → {remote_path}')
        sftp.put(local_path, remote_path)
    sftp.close()
    print('Files synced.\n')

    # Read current nginx config
    print('=== Checking nginx config ===')
    out, _ = run(client, 'cat /etc/nginx/sites-enabled/hikma')

    if '/HikmaProf' in out:
        print('HikmaProf nginx block already present.')
    else:
        print('Adding HikmaProf nginx location block...')
        # Insert before the closing brace of the server block
        # Find the last "}" and insert before it
        insert_marker = '    # ESRA — Emotional Sensing and Recognition App'
        if insert_marker in out:
            new_config = out.replace(insert_marker,
                                     NGINX_BLOCK + '\n' + insert_marker)
        else:
            # Fallback: insert before last }
            last_brace = out.rfind('}')
            new_config = out[:last_brace] + NGINX_BLOCK + '\n' + out[last_brace:]

        # Write new config
        _, sftp2 = client.exec_command('cat > /tmp/hikma_nginx_new.conf', timeout=10)
        sftp_w = client.open_sftp()
        import io
        with sftp_w.open('/tmp/hikma_nginx_new.conf', 'w') as f:
            f.write(new_config)
        sftp_w.close()

        run(client, 'sudo cp /tmp/hikma_nginx_new.conf /etc/nginx/sites-enabled/hikma')
        out2, err2 = run(client, 'sudo nginx -t')
        if 'ok' in out2.lower() or 'ok' in err2.lower() or 'successful' in err2.lower():
            run(client, 'sudo nginx -s reload')
            print('Nginx reloaded.')
        else:
            print('Nginx test failed — reverting!')
            run(client, 'sudo cp /etc/nginx/sites-enabled/hikma.bak /etc/nginx/sites-enabled/hikma 2>/dev/null || true')

    # Restart Flask app
    print('\n=== Restarting Flask app ===')
    run(client, "pkill -f 'python3 app.py' || true")
    time.sleep(1)
    run(client,
        f"cd {REMOTE_DIR} && bash -c 'nohup python3 app.py --port 9000 > app.log 2>&1 & echo $!'",
        timeout=10)
    time.sleep(3)

    # Verify
    print('\n=== Verification ===')
    run(client, "pgrep -fa 'python3 app.py'")
    run(client, f'tail -10 {REMOTE_DIR}/app.log')
    run(client, 'ss -tlnp | grep 9000')

    client.close()
    print(f'\nDone. Visit: https://hikma.hbku.edu.qa/HikmaProf/')


if __name__ == '__main__':
    main()
